# ST-212 runtime query-shape security review
contract: REVIEW/v1
task_id: ST-212
reviewer: security-privacy
verdict: APPROVE_SOURCE
source_blobs: service 6b59822cc7ee148683c9b696207cf049cf7fec13; service_spec dbcf2ad3f5694476b37f0a6f85625cfe6d46139b; controller_spec 8ddb9fd88599b1d5816cd5d0969e1c36fe5862b0.
findings: []
assessment: Only top-level query records now accept a null prototype, matching Express 5. Own-key allowlists still reject owner selectors and unknown keys; arrays, invalid scope/status/category/limit and bounded endpoint/filter-bound cursors remain rejected. Cursor JSON and detection reason records retain strict ordinary-object parsing. HTTP regression reaches the real service and checks 200 for a valid query and 400 for an owner selector; test labels contain no sensitive values.
boundary: Source approval only. Actual PostgreSQL proof, independent QA, exact-head CI and accepted BUG-008b parent remain required.
