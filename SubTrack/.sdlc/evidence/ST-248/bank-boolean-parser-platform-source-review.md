# ST248 bank Boolean parser platform source review

Verdict: **SOURCE GO** for the narrow bank Boolean wire repair. This is not an actual PostgreSQL or installed-client acceptance result.

The failed two-owner retain request contained the already contracted literal `purge:false`, which the shared private body parser rejects. The new parser is selected only after the existing private mobile wire and exact path admission, and only for the existing bank paths. Bodyless refresh, other mobile paths, request key/Bearer checks, current authority, strict bank operation schemas, SQL, and receipt behavior remain on their existing paths.

The dedicated parser keeps exact declared and received byte checks with the 8192-byte cap, fatal UTF-8 decoding, flat JSON token framing, decoded duplicate and prototype-key rejection, and string/null values. It additionally admits Boolean literals only under the decoded `purge` key; wrong-field Booleans and other value shapes fail closed. Focused parser and HTTP boundary tests cover both literals reaching the existing profile and foreign-owner gates, as well as malformed, duplicate, header, and path cases. Author-reported focused checks passed (6 tests; parser 46/46 branches; API types and scoped lint); I reviewed source without rerunning them.

No platform source blocker found. Run the changed actual PostgreSQL qualifier and retain its ordinary cleanup/result requirements before claiming bank acceptance.
