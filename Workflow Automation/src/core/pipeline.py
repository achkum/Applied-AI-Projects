import json
from src.integrations.gmail import EmailIntegration
from src.ai.gemini import LLM_API
from src.core.router import Router
from src.db import session as db_session
from src.utils.logger import logger

class MainPipeline:
    def __init__(self, api_key: str):
        self.email_integration = EmailIntegration()
        self.llm_api = LLM_API(api_key=api_key)
        self.router = Router()
    
    def run(self, token_path):
        db_session.init_db()

        self.email_integration.authenticate(token_path)
        self.email_integration.get_latest_emails()
        email_contents = self.email_integration.get_email_content()
        
        results = []

        for email in email_contents:
            email_id = email.get('id')
            logger.debug(f"Checking email ID: {email_id}")
            
            existing_record = db_session.get_email(email_id)
            
            if existing_record:
                logger.info(f"✓ CACHE HIT - Email {email_id[:12]}...")
                result = json.loads(existing_record.analysis_json)
            else:
                logger.info(f"✗ CACHE MISS - Calling LLM for {email_id[:12]}...")
                email_text = f"From: {email['from']}\nSubject: {email['subject']}\nDate: {email['date']}\n\n{email['body']}"
                
                self.llm_api.call_llm_api(email_text)
                result = self.llm_api.process_response()
                db_session.save_email(email, result)
            
            logger.info(f"Analysis: Team={result.get('suggested_team')}, Priority={result.get('priority')}")
            self.router.route(email_id, result)

            results.append({
                "email_id": email_id,
                "subject": email['subject'],
                "analysis": result
            })
        
        return results
