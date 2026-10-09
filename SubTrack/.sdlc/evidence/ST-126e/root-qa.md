# ST126e root verification

FullMoney142 tests/7files PASS, including18newcases. Exact helperV8 JSONpath asserted:41/41branches,60/60statements,56/56lines,8/8functions (all100%). Moneylint, stricttypecheck and buildPASS. No coverageconfig/thresholdchange.

Rootcaught three bad unit-fixture assumptions BEFOREinitialQA: EUR reference pairs had identical original/settledcurrency and differedfromcandidate; largeBigInt reference billamount was10000 instead ofmatchinglargebase, so ratioswereinconsistent; Moneyfactory uppercasescurrency so lowercase-rejection fixtureswerenonnegativecases. Rootfixed actualgolden inputs withoutweakeningruntime, added nonstringcurrency andstringhistorylength failures, varied/froze nestedhistorypairs formeaningfulpermutation/immutability, narrowed snapshot-testtitle towhatitmeasures. Finalgoldens prove exact5%boundary/adjacentoutside, fractionalordinaryevenmedian, oddmedian, equivalentratios/changedbillamount, signedmagnitudes andhugeBigInts;0..3/4/50/51samples, allinputvalidationeveninsufficienthistory, capturedfields/counts/fixederror failures. Runtimearithmeticunchanged.

Conductor architecture/mathreview afterindependentplanAPPROVE: homogeneouscurrency exponentfactorscancel underpositive scaling ofordinarymedian andrelativedrift. n/d vsN/D strict5% reduces20*abs(nD-Nd)>N*d, equalityinside. AllmoneyarithmeticinsidepackagesMoney. ADR0015 andAssumptions/taskrecorded BEFOREdispatch:effectiveBOOKEDcostinclfees/markup/rounding, FOURpriorreferences/50max/strict5% heuristic (Assumed), notmarket-rate-only/productionconfidence/defaultintegration. Authoritative provider/sourcepairedvaluesnotavailable inexistingtypedflow; no fields invented, fullST081ST126/FXintegration remainpending.

Scopeaccounting: author3calls inclmissingdecisionrulespathread, unit5calls inclmissingtasklookup; actualfailuresretained. Rootreadcorrectguidance/taskandexplicitlockedplancontract; independentfrozen4hashsourceQArequiredbeforemerge. No token/context savingsclaim or approvalwaiver.

Stagedgitleaks/exactheadCI remainseparatemergegatespendingatthischeckpoint.
