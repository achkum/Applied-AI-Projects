from src.ingestion.processor import DocumentProcessor
from src.retrieval.vector_store import VectorStore
from src.ai.engine import LLMInterface
from src.db.session import SessionLocal
from src.db.models import Document, Chunk, ComplianceInsight
from src.utils.logging_helper import setup_logger

logger = setup_logger("pipeline")

class CompliancePipeline:
    def __init__(self):
        self.processor = DocumentProcessor()
        self.vector_store = VectorStore()
        self.ai_engine = LLMInterface()

    def run(self, file_path: str):
        logger.info(f"Processing document: {file_path}")
        
        # 1. Ingestion
        processed_data = self.processor.process(file_path)
        text = processed_data["text"]
        content_hash = processed_data["content_hash"]
        filename = processed_data["filename"]
        
        db = SessionLocal()
        try:
            # --- CACHING LOGIC ---
            previous_doc = None
            # 1. Exact match (Content Hash)
            existing_doc = db.query(Document).filter(Document.content_hash == content_hash).first()
            if existing_doc:
                # Find the most recently published insight for this doc
                insight = db.query(ComplianceInsight).filter(
                    ComplianceInsight.document_id == existing_doc.id,
                    ComplianceInsight.status == 'PUBLISHED'
                ).order_by(ComplianceInsight.created_at.desc()).first()
                
                if insight:
                    logger.info("Exact content match found. Returning cached published insight.")
                    return existing_doc.id
                
                # If it exists but no published insight, use the existing doc object
                doc = existing_doc
                logger.info(f"Existing document found (ID: {doc.id}) but no published insight. Proceeding with analysis.")
            else:
                # --- AUTO-COMPARE LOGIC ---
                # 2. Check if a document with the same filename exists (Version detection)
                previous_doc = db.query(Document).filter(
                    Document.filename == filename,
                    Document.content_hash != content_hash
                ).order_by(Document.created_at.desc()).first()

                doc = Document(filename=filename, content_hash=content_hash)
                db.add(doc)
                db.commit()
                db.refresh(doc)

                # Chunking and Indexing (Only for really new docs)
                chunks = self.processor.chunk_text(text)
                db_chunks = [Chunk(document_id=doc.id, content=c) for c in chunks]
                db.add_all(db_chunks)
                db.commit()
                self.vector_store.add_chunks(chunks, doc.id)

            # Retrieval
            search_results = self.vector_store.query("sanctions AML CTF high risk", n_results=5)
            context = "\n".join(search_results["documents"][0])

            if previous_doc:
                # Perform comparison
                logger.info(f"Version change detected for {filename}. Triggering comparison.")
                old_insight = db.query(ComplianceInsight).filter(
                    ComplianceInsight.document_id == previous_doc.id,
                    ComplianceInsight.status == 'PUBLISHED'
                ).first()
                
                old_text = old_insight.summary if old_insight else "No previous summary available."
                analysis = self.ai_engine.compare_compliance(text, old_text)
                insight_type = "comparison"
                source_refs = {"added": analysis.added_entities, "removed": analysis.removed_entities}
            else:
                # Standard analysis
                logger.info(f"New document detected: {filename}. Standard analysis triggered.")
                analysis = self.ai_engine.analyze_compliance(context, text)
                insight_type = "standard"
                source_refs = {"entities": analysis.entities, "countries": analysis.high_risk_countries}

            # 3. VERSIONING & STAGING
            insight_data = analysis.dict() if hasattr(analysis, "dict") else analysis.model_dump()
            new_insight = ComplianceInsight(
                document_id=doc.id,
                insight_type=insight_type,
                summary=analysis.summary,
                confidence=analysis.confidence_score,
                source_refs=source_refs,
                raw_llm_json=insight_data, # Save raw JSON
                status='DRAFT' # Default to DRAFT for review
            )
            db.add(new_insight)
            db.commit()
            
            logger.info(f"Pipeline completed with {new_insight.status} status for {doc.id}")
            return doc.id
            
        except Exception as e:
            logger.error(f"Pipeline failed: {e}")
            db.rollback()
            raise e
        finally:
            db.close()
