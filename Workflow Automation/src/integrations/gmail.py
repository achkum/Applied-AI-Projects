import os.path
import base64
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from src.utils.logger import logger

class EmailIntegration:
    def __init__(self):
        self.SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
        self.credentials = None
        self.service = None
        self.messages = []

    def authenticate(self, token_path):
        if os.path.exists(token_path):
            self.credentials = Credentials.from_authorized_user_file(token_path, self.SCOPES)
        
        if not self.credentials or not self.credentials.valid:
            if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                self.credentials.refresh(Request())
            else:
                if not os.path.exists('credentials.json'):
                    raise FileNotFoundError("Missing 'credentials.json'. Please download it from Google Cloud Console.")
                
                flow = InstalledAppFlow.from_client_secrets_file('credentials.json', self.SCOPES)
                self.credentials = flow.run_local_server(port=0)
            
            with open(token_path, 'w') as token:
                token.write(self.credentials.to_json())

    def get_latest_emails(self, max_results=1):
        self.service = build('gmail', 'v1', credentials=self.credentials)
        results = self.service.users().messages().list(userId='me', labelIds=['INBOX'], maxResults=max_results).execute()
        self.messages = results.get('messages', [])
        return self.messages

    def get_email_content(self):
        email_contents = []
        for message in self.messages:
            msg = self.service.users().messages().get(userId='me', id=message['id']).execute()
            headers = {h['name']: h['value'] for h in msg['payload']['headers']}
            
            body = ""
            if 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode('utf-8')
            elif 'parts' in msg['payload']:
                for part in msg['payload']['parts']:
                    if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                        body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                        break
            
            email_content = {
                'id': message['id'],
                'from': headers.get('From'),
                'subject': headers.get('Subject'),
                'date': headers.get('Date'),
                'body': body
            }
            email_contents.append(email_content)
            logger.info(f"Fetched email: [{email_content['from']}] {email_content['subject']}")
        
        return email_contents
