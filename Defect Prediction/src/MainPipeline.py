from pathlib import Path
from DataHandler import DataHandler
from ModelManager import ModelManager
from Evaluator import Evaluator
from Visualizer import Visualizer

class DefectPredictionPipeline:
    """Main pipeline orchestrating the workflow."""
    def __init__(self,data_path):
        self.data_handler = DataHandler(data_path)
        self.model_manager = ModelManager()

    def run(self):
        # Call Data Handler to read, explore, preprocess data, and split data
        self.data_handler.read_data()
        self.data_handler.explore_data()
        X_train, X_test, y_train, y_test = self.data_handler.preprocess()

        # Call Model manager to initialize Models and train models
        self.model_manager.train_all(X_train,y_train)

        #Call Evaluator to evaluate performance
        evaluator = Evaluator(self.model_manager.models,X_test,y_test)
        results = evaluator.evaluate()
        evaluator.plot_roc_curves()
        #Call Visualizer to Visualize again.
        # Visualize feature importances (Random Forest as example)
        Visualizer.plot_feature_importance(
            self.model_manager.models["Random Forest"],
            feature_names=self.data_handler.df.drop(['Defective'], axis=1).columns
        )

        print("\nPipeline complete.")
        return results
    

if __name__ == "__main__":
    data_path = str(Path(__file__).resolve().parent.parent / "data" / "defect_data.csv")
    pipeline = DefectPredictionPipeline(data_path)
    pipeline.run()