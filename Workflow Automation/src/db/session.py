from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import json
from src.db.models import Base, EmailAnalysis
from src.utils.logger import logger

DATA_BASE_URL = "sqlite:///emails.db"
engine = create_engine(DATA_BASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized")

def get_email(email_id: str):
    db = SessionLocal()
    try:
        logger.debug(f"Querying DB for email_id: {email_id}")
        return db.query(EmailAnalysis).filter(EmailAnalysis.id == email_id).first()
    finally:
        db.close()

def save_email(email_data: dict, analysis_result: dict):
    db = SessionLocal()
    try:
        db_email = EmailAnalysis(
            id=email_data['id'],
            sender=email_data['from'],
            subject=email_data['subject'],
            received_at=email_data['date'],
            analysis_json=json.dumps(analysis_result)
        )
        db.add(db_email)
        db.commit()
        logger.info(f"Saved email {email_data['id'][:12]}... to database")
    except Exception as e:
        logger.error(f"Error saving to DB: {e}")
        db.rollback()
    finally:
        db.close()
