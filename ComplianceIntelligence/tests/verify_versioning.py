import requests
import time
import os

BASE_URL = "http://127.0.0.1:8000/v1"

def test_versioning_flow():
    # 1. Create Baseline Document
    doc_v1 = "sanctions_v1.txt"
    with open(doc_v1, "w") as f:
        f.write("Compliance List v1: Entity 'X-Trade' is sanctioned.")
    
    print("\n--- Testing Baseline Ingestion ---")
    with open(doc_v1, 'rb') as f:
        files = {'file': (doc_v1, f, 'text/plain')}
        res = requests.post(f"{BASE_URL}/ingest", files=files)
    
    if res.status_code != 200:
        print(f"FAILED: {res.status_code} - {res.text}")
        return
    doc_id_v1 = res.json()["document_id"]
    print(f"Ingested v1: {doc_id_v1}")

    # Check status (should be DRAFT)
    res = requests.get(f"{BASE_URL}/analysis/{doc_id_v1}")
    print(f"v1 Status: {res.json().get('status')}")

    # 2. Publish v1
    print("\n--- Publishing v1 ---")
    requests.post(f"{BASE_URL}/analysis/{doc_id_v1}/publish")
    res = requests.get(f"{BASE_URL}/analysis/{doc_id_v1}")
    print(f"v1 Status after publish: {res.json().get('status')}")

    # 3. Test Caching (Exact same file)
    print("\n--- Testing Caching (Same content) ---")
    with open(doc_v1, 'rb') as f:
        files = {'file': (doc_v1, f, 'text/plain')}
        res = requests.post(f"{BASE_URL}/ingest", files=files)
    print(f"Result (should match v1 ID): {res.json()['document_id']}")

    # 4. Test Comparison (Same name, different content)
    doc_v2 = "sanctions_v1.txt" # Same filename
    with open(doc_v2, "w") as f:
        f.write("Compliance List v2: Entity 'X-Trade' is removed, 'Z-Global' added.")
    
    print("\n--- Testing Auto-Comparison (New version) ---")
    with open(doc_v2, 'rb') as f:
        files = {'file': (doc_v2, f, 'text/plain')}
        res = requests.post(f"{BASE_URL}/ingest", files=files)
    doc_id_v2 = res.json()["document_id"]
    print(f"Ingested v2: {doc_id_v2}")

    # Check analysis type
    res = requests.get(f"{BASE_URL}/analysis/{doc_id_v2}")
    print(f"v2 Analysis Type: {res.json().get('type')}")
    print(f"v2 Summary: {res.json().get('summary')}")

    # Cleanup
    if os.path.exists(doc_v1):
        os.remove(doc_v1)

if __name__ == "__main__":
    test_versioning_flow()
