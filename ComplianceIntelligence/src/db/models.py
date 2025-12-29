import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Float, JSON, ForeignKey, Integer
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    content_hash = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")
    insights = relationship("ComplianceInsight", back_populates="document", cascade="all, delete-orphan")

class Chunk(Base):
    __tablename__ = "chunks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    content = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=True) # Renamed from 'metadata' to avoid conflict with Base.metadata
    
    document = relationship("Document", back_populates="chunks")

class ComplianceInsight(Base):
    __tablename__ = 'compliance_insights'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey('documents.id'))
    insight_type = Column(String(50))  # e.g., 'summary', 'comparison'
    summary = Column(Text)
    confidence = Column(Float)
    source_refs = Column(JSON)  # Store entities, countries, etc.
    status = Column(String(20), default='DRAFT')  # 'DRAFT', 'PUBLISHED'
    raw_llm_json = Column(JSON)  # Store original response for version control
    created_at = Column(DateTime, default=datetime.utcnow)
 # List of chunk IDs or page numbers
    
    document = relationship("Document", back_populates="insights")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    action = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(JSON, nullable=True)
