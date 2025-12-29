import requests
import os

BASE_URL = "http://127.0.0.1:8000/v1"

def test_api():
    print("Starting API Verification...")
    
    # 1. Test Ingest
    print("\n--- Testing Document Ingestion ---")
    # 1. Test Ingest
    print("\n--- Testing Document Ingestion ---")
    test_file_path = os.path.join("tests", "test_data", "sample_notice.txt")
    
    if not os.path.exists(test_file_path):
        print(f"FAILED: Test file missing: {test_file_path}")
        return

    with open(test_file_path, "rb") as f:
        files = {'file': ("sample_notice.txt", f, 'text/plain')}
        response = requests.post(f"{BASE_URL}/ingest", files=files)
    
    if response.status_code == 200:
        doc_id = response.json()["document_id"]
        print(f"SUCCESS: Ingested document ID: {doc_id}")
    else:
        print(f"FAILED: Ingest failed with status {response.status_code}: {response.text}")
        return

    # 2. Test List Documents
    print("\n--- Testing List Documents ---")
    response = requests.get(f"{BASE_URL}/documents")
    print(f"Documents: {response.json()}")

    # 3. Test Retrieve Analysis
    print("\n--- Testing Retrieve Analysis ---")
    response = requests.get(f"{BASE_URL}/analysis/{doc_id}")
    if response.status_code == 200:
        print(f"Analysis: {response.json()}")
    else:
        print(f"FAILED: Retrieve analysis failed: {response.text}")

if __name__ == "__main__":
    test_api()
