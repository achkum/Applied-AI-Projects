import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
    roc_curve,
    classification_report
)
import matplotlib.pyplot as plt 

class Evaluator:
    def __init__(self, models, X_test, y_test):
        self.models = models
        self.X_test = X_test
        self.y_test = y_test
        self.scores = []

    def evaluate(self):
        """Compute the Accuracy, F1-score, ROC AUC for each model"""
        print("\n Model Evaluation")
        for name,model in self.models.items():
            y_pred = model.predict(self.X_test)
            y_prob = model.predict_proba(self.X_test)[:, 1]

            acc = accuracy_score(self.y_test,y_pred)
            f1 = f1_score(self.y_test,y_pred)
            roc = roc_auc_score(self.y_test,y_pred)

            self.scores.append({
                "Model" : name,
                "Accuracy" : round(acc,4),
                "F1-score" : round(f1,4),
                "ROC AUC" : round(roc,4),
            })

            print(f"\n{name}:\n", classification_report(self.y_test, y_pred))
        results_df = pd.DataFrame(self.scores)
        print("\n--- Summary ---")
        print(results_df)

    def plot_roc_curves(self):
        """Visualize ROC curves for all models"""
        plt.figure(figsize=(8,6))
        for name, model in self.models.items():
            y_prob = model.predict_proba(self.X_test)[:, 1]
            fpr, tpr, _ = roc_curve(self.y_test, y_prob)
            plt.plot(fpr, tpr, label=f"{name}")
        plt.plot([0, 1], [0, 1], 'k--')
        plt.xlabel("False Positive Rate")
        plt.ylabel("True Positive Rate")
        plt.title("ROC Curve Comparison")
        plt.legend()
        plt.show()

    

    




