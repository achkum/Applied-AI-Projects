from typing import List, Dict, Any
from pydantic import BaseModel, Field
import yaml
import openai
import anthropic

import google.generativeai as genai

class ComplianceRiskSummary(BaseModel):
    summary: str = Field(description="A concise summary of the compliance risks found in the document.")
    entities: List[str] = Field(description="List of sanctioned parties or high-risk entities identified.")
    high_risk_countries: List[str] = Field(description="List of high-risk countries mentioned.")
    confidence_score: float = Field(description="Confidence score for the analysis (0.0 to 1.0).")
    source_references: List[str] = Field(description="References to specific sections or chunks for grounding.")

class ComplianceComparison(BaseModel):
    summary: str = Field(description="A summary of what has changed between the versions.")
    added_entities: List[str] = Field(description="New entities/sanctioned parties found in the current version.")
    removed_entities: List[str] = Field(description="Entities from the previous version no longer present.")
    risk_level_shift: str = Field(description="Description of any changes in risk severity (e.g., 'Increased due to...').")
    confidence_score: float = Field(description="Confidence score for the comparison (0.0 to 1.0).")

class LLMInterface:
    def __init__(self, config_path: str = "config.yaml"):
        import os
        from dotenv import load_dotenv
        load_dotenv() # Load from .env if it exists

        self.config = {}
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                full_config = yaml.safe_load(f)
                self.config = full_config.get("llm", {})
        
        self.provider = self.config.get("provider", "google")
        self.model = self.config.get("model", "gemini-2.0-flash")
        self.mock_mode = self.config.get("mock_mode", False)
        
        # Priority: Environment Variable > config.yaml
        self.google_api_key = os.getenv("GOOGLE_API_KEY") or self.config.get("google_api_key")
        self.openai_api_key = os.getenv("OPENAI_API_KEY") or self.config.get("openai_api_key")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY") or self.config.get("anthropic_api_key")

        # Configure providers
        if self.provider == "openai":
            if not self.openai_api_key:
                raise ValueError("OpenAI API Key not found.")
            openai.api_key = self.openai_api_key
        elif self.provider == "anthropic":
            if not self.anthropic_api_key:
                raise ValueError("Anthropic API Key not found.")
            self.anthropic_client = anthropic.Anthropic(api_key=self.anthropic_api_key)
        elif self.provider == "google":
            if not self.google_api_key and not self.mock_mode:
                raise ValueError("Google API Key not found.")
            if self.google_api_key:
                genai.configure(api_key=self.google_api_key)

    def analyze_compliance(self, context: str, document_text: str) -> ComplianceRiskSummary:
        prompt = f"""
        Analyze the following regulatory document for AML and Sanction risks. 
        Use the provided retrieval context for grounding.
        
        Retrieval Context:
        {context}
        
        Document Text (Excerpt):
        {document_text[:4000]}
        
        Respond with a structured JSON matching the following schema:
        - summary: Concise risk summary
        - entities: List of parties/entities
        - high_risk_countries: List of countries
        - confidence_score: 0.0 to 1.0
        - source_references: List of grounding sections
        """
        return self._call_provider(prompt, ComplianceRiskSummary)

    def compare_compliance(self, new_text: str, old_summary: str) -> ComplianceComparison:
        prompt = f"""
        Compare the new regulatory document version against the previous summary.
        Identify what has changed, what was added, and what was removed.
        
        Previous Summary:
        {old_summary}
        
        New Document Text (Excerpt):
        {new_text[:4000]}
        
        Respond with a structured JSON matching the following schema:
        - summary: Delta analysis summary
        - added_entities: List of new entities
        - removed_entities: List of entities no longer present
        - risk_level_shift: Description of risk change
        - confidence_score: 0.0 to 1.0
        """
        return self._call_provider(prompt, ComplianceComparison)

    def _call_provider(self, prompt: str, schema_class: Any) -> Any:
        if self.mock_mode:
            if schema_class == ComplianceRiskSummary:
                return ComplianceRiskSummary(
                    summary="MOCK: High risk detected in new document.",
                    entities=["Mock Entity"],
                    high_risk_countries=["Mockland"],
                    confidence_score=0.99,
                    source_references=["Mock Para 1"]
                )
            else:
                return ComplianceComparison(
                    summary="MOCK: Differences identified between versions.",
                    added_entities=["New Mock Entity"],
                    removed_entities=["Old Mock Entity"],
                    risk_level_shift="Increased",
                    confidence_score=0.95
                )

        if self.provider == "google":
            return self._call_google(prompt, schema_class)
        # Add basic support for others if needed, for now focusing on google
        raise ValueError(f"Provider {self.provider} not fully integrated for complex schemas yet.")

    def _call_google(self, prompt: str, schema_class: Any) -> Any:
        """Implementation for Gemini real inference."""
        model = genai.GenerativeModel(self.model)
        
        generation_config = {
            "temperature": self.config.get("temperature", 0.1),
            "response_mime_type": "application/json",
        }
        
        response = model.generate_content(
            prompt,
            generation_config=generation_config
        )
        
        try:
            import json
            data = json.loads(response.text)
            return schema_class(**data)
        except Exception as e:
            # Simple error return matching schema
            if schema_class == ComplianceRiskSummary:
                return ComplianceRiskSummary(summary=f"Error: {str(e)}", entities=[], high_risk_countries=[], confidence_score=0, source_references=[])
            else:
                return ComplianceComparison(summary=f"Error: {str(e)}", added_entities=[], removed_entities=[], risk_level_shift="No change", confidence_score=0)
