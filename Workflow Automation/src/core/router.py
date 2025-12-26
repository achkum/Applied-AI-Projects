from src.utils.logger import logger

class Router:
    def route(self, email_id, analysis_result):
        if not analysis_result or "error" in analysis_result:
            logger.warning(f"Router skipping email {email_id}: Invalid analysis")
            return

        logger.info(f"[ROUTER] Processing email {email_id}")
        
        team = analysis_result.get("suggested_team")
        if team:
            logger.info(f"  -> Would route to Team: {team}")
            
        priority = analysis_result.get("priority")
        if priority and priority.lower() in ["high", "urgent"]:
             logger.info(f"  -> Would mark as Priority: {priority.capitalize()}")

        risk = analysis_result.get("risk_score", 0)
        if isinstance(risk, (int, float)) and risk > 0.7:
             logger.warning(f"  -> High risk detected: {risk}")
