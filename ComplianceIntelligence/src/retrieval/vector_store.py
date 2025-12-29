from typing import List, Dict
import chromadb
# from sentence_transformers import SentenceTransformer -- Moved to method

class VectorStore:
    def __init__(self, path: str = "./vector_db", model_name: str = "all-MiniLM-L6-v2", config_path: str = "config.yaml"):
        import yaml
        with open(config_path, "r") as f:
            self.mock_mode = yaml.safe_load(f).get("llm", {}).get("mock_mode", False)
        
        self.client = chromadb.PersistentClient(path=path)
        self.model_name = model_name
        self.model = None
        self.collection = self.client.get_or_create_collection(name="compliance_chunks")

    def _get_model(self):
        if self.mock_mode:
            return None
        if self.model is None:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(self.model_name)
        return self.model

    def add_chunks(self, chunks: List[str], document_id: str, metadata: List[Dict] = None):
        if self.mock_mode:
            # Simple mock: use length of text as "embedding" (just for functional shell)
            embeddings = [[float(len(c))] * 384 for c in chunks]
        else:
            model = self._get_model()
            embeddings = model.encode(chunks).tolist()
        ids = [f"{document_id}_{i}" for i in range(len(chunks))]
        
        # Prepare metadata if not provided
        if not metadata:
            metadata = [{"document_id": document_id} for _ in chunks]
            
        self.collection.add(
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadata,
            ids=ids
        )

    def query(self, query_text: str, n_results: int = 5) -> Dict:
        if self.mock_mode:
            # Simple mock: use length matching the dummy embedding size
            query_embedding = [[1.0] * 384]
        else:
            model = self._get_model()
            query_embedding = model.encode([query_text]).tolist()

        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=n_results
        )
        return results
