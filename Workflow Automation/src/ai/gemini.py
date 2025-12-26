import json
import google.generativeai as genai
from src.utils.logger import logger

class LLM_API:
    def __init__(self, api_key: str, model: str ="gemini-2.5-flash"):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)
        self.raw_response = None

    def call_llm_api(self, email_text):
        prompt = f'''
        You are an assistant that analyzes customer emails for a bank.
        Return ONLY valid JSON with these fields:
        - summary, issue_type, priority, sentiment, suggested_team, risk_score
        Email:
        {email_text}
        '''
        try:
            response = self.model.generate_content(prompt)
            self.raw_response = response.text
            logger.debug(f"Raw LLM response: {self.raw_response[:200]}...")
            return self.raw_response
        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            return None

    def process_response(self):
        if not self.raw_response:
            return {}
        try:
            clean_content = self.raw_response.replace('```json', '').replace('```', '').strip()
            return json.loads(clean_content)
        except json.JSONDecodeError:
            logger.error("Failed to parse JSON from LLM response")
            return {"error": "Invalid JSON from LLM", "raw": self.raw_response}
