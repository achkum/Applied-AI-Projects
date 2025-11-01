import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier

class ModelManager:
    def __init__(self):
        self.models = {
            "Logistic Regression" : LogisticRegression(max_iter = 1000),
            "Random Forest" : RandomForestClassifier(n_estimators = 100, random_state = 42),
            "XGBoost" : XGBClassifier(use_label_encoder = False, eval_metric = 'logloss', random_state = 42)
        }
        self.results = pd.DataFrame()

    def train_all(self,X_train,y_train):
        """Training each model"""
        print("Training the models")
        for name, model in self.models.items():
            print("Training Model:",name)
            model.fit(X_train,y_train)
        print("All models trained successfully")
    
    def predict_all(self,X_test):
        """Checking Predictions for all each"""
        predictions = {}
        for name, model in self.models.items():
            predictions[name] = model.predict(X_test)
        return predictions
    
    
    