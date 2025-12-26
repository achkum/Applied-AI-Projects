from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class EmailAnalysis(Base):
    __tablename__ = "email_analysis"

    id = Column(String, primary_key=True, index=True)
    sender = Column(String)
    subject = Column(String)
    received_at = Column(String)
    analysis_json = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
