import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

class Visualizer:
    """Handles plotting feature importance and other charts."""

    @staticmethod
    def plot_feature_importance(model, feature_names, top_n=10):
        """Plot feature importances for tree-based models."""
        if not hasattr(model, "feature_importances_"):
            print("Model does not support feature importance visualization.")
            return

        importances = model.feature_importances_
        indices = np.argsort(importances)[::-1][:top_n]
        plt.figure(figsize=(10, 6))
        sns.barplot(x=importances[indices], y=np.array(feature_names)[indices], orient='h')
        plt.title(f"Top {top_n} Feature Importances")
        plt.show()
