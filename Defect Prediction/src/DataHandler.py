from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

class DataHandler:
    def __init__(self,data_path):
        self.data_path = data_path
        self.df = None
        self.X_train = self.X_test = self.y_train = self.y_test = None
        self.scaler = StandardScaler()
    
    def read_data(self):
        """Read the data based on the path given"""
        try:
            self.df = pd.read_csv(self.data_path)
        except:
            print("Something went wrong while reading CSV. Please check path again!")
        
        print("Data Loaded successfully")
        print(f"Shape :{self.df.shape}")
        return self.df
    
    def explore_data(self):
         """Display dataset overview."""
         print("\n--- Dataset Overview ---")
         print(f"\nFirst 20 rows :{self.df.head(20)}")
         print(self.df.info)
         print("\n Missing Values \n",self.df.isnull().sum())
         print("\n Class distribution \n")
         print(self.df['Defective'].value_counts(normalize=True))
         sns.countplot(x='Defective', data=self.df)
         plt.title("Defect Distribution")
         plt.show()
    
    def preprocess(self):
        """Clean the data and then split into train and test sets"""
        df =  self.df.dropna()
        X = df.drop(['Defective'],axis = 1) # All the columns/Features except Classifier
        y = df['Defective'].map({'Y': 1,'N': 0})  # Converting Y/N to 1/0 for classification

        X_scaled = self.scaler.fit_transform(X)  #Scaling so that the data is normalized

        #Splitting the Data
        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X_scaled, y, test_size=0.2, random_state=42, stratify=y
        )

        print(f"\nData Split completed :\n {self.X_train.shape[0]} train,{self.X_test.shape[0]} test samples")
        return self.X_train, self.X_test, self.y_train, self.y_test
    






