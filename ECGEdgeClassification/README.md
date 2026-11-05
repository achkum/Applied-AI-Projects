# Edge-Ready ECG Classification using CRISP-DM

**D7043E Advanced Data Mining, Luleå University of Technology (group project)**

Inter-patient N/S/V/F heartbeat classification on the MIT-BIH Arrhythmia Database with a small 1D CNN
(10,004 parameters) prepared for the Analog Devices MAX78002. The project follows all six CRISP-DM stages:
Task 1 (stages 1–3) prepares the data, Task 2 (stages 4–6) trains, quantises, evaluates and synthesises
the model. It is a study of the data-mining and Edge-AI process, **not a medical device**; no clinical
validity and no hardware measurements are claimed.

## Results (test set DS2, inter-patient)

| Model | Parameters | Accuracy | Macro F1 |
|---|---|---|---|
| Random Forest (baseline) | 204,356 | 0.939 | 0.475 |
| Edge CNN, FP32 | 10,004 | 0.914 | 0.611 |
| Edge CNN, INT8 (post-training) | 10,004 | 0.913 | 0.609 |
| **Edge CNN, INT8 (QAT, MAX78002 toolchain)** | 10,004 | **0.932** | **0.664** |

Macro F1 is the main metric because the classes are highly imbalanced. Full metrics, confusion matrices and
noise-robustness results are in [`results/`](results).

## Contents

```
ECGEdgeClassification/
├── README.md                  this file
├── requirements.txt           exact package versions used
├── configs/
│   ├── data.yaml              record splits, lead, filter, window, normalisation, label map
│   ├── noise.yaml             NSTDB noise types, SNR levels, evaluation region
│   └── train.yaml             training settings of the CNN
├── src/
│   ├── prepare_data.py        stage 3: raw records -> model inputs + statistics
│   ├── ecg_noise.py           NSTDB noise at a controlled SNR (PhysioNet `nst` definition)
│   ├── dataset.py             training-only augmentation and class weights
│   ├── model.py               the edge CNN
│   ├── metrics.py             accuracy, macro F1, per-class metrics, confusion matrices
│   ├── baseline.py            random-forest baseline
│   ├── train.py               CNN training with early stopping on validation macro F1
│   ├── evaluate.py            evaluation, confusion matrix, error-analysis figures
│   ├── quantize.py            INT16 / INT8 post-training quantisation (simulated)
│   └── noise_test.py          noise robustness test on DS2
├── notebooks/
│   └── EDA.ipynb              stage 2: exploratory analysis and data-quality checks (executed)
├── results/                   all generated statistics, metrics, confusion matrices and figures
│                              (EDA figures in results/figures/, error examples in results/errors/)
└── max78002/                  ai8x model, dataset and network files; QAT, quantisation and
                               synthesis outputs; README.md with the toolchain commands
```

## 1. Set up

Python 3.11 or newer (tested with 3.13.16 on Linux, CPU only).

```bash
python -m venv .venv && source .venv/bin/activate      # optional
pip install -r requirements.txt
```

## 2. Download the data (not included in this package)

```bash
python src/prepare_data.py --config configs/data.yaml --download
```

`--download` uses `wfdb.dl_database` to fetch

* MIT-BIH Arrhythmia Database v1.0.0 → `data/mitdb/` (about 90 MB): https://physionet.org/content/mitdb/1.0.0/
* MIT-BIH Noise Stress Test Database v1.0.0 → `data/nstdb/` (about 30 MB): https://physionet.org/content/nstdb/1.0.0/

Manual alternative: download the ZIP files from the two pages above and unpack them so that
`data/mitdb/100.dat` and `data/nstdb/em.dat` exist. If the folders already contain `.dat` files,
the download step is skipped.

## 3. Run everything, in order (from the project root)

| Step | Command | Output |
|---|---|---|
| Preprocess (stage 3) | `python src/prepare_data.py --config configs/data.yaml` | `data/processed/*.npz`, `results/split_stats.csv` and other statistics |
| EDA (stage 2) | `jupyter nbconvert --to notebook --execute --inplace notebooks/EDA.ipynb` | `results/figures/`, data-quality and leakage tables |
| Baseline | `python src/baseline.py` | `results/baseline/` |
| Train the CNN | `python src/train.py --tag edge_cnn` | `results/runs/edge_cnn/` |
| Variants for model selection | `python src/train.py --tag focal --loss focal` (also `--size large`, `--loss ce`, `--no-augment`, `--no-rr`) | `results/runs/<tag>/`, `results/model_selection.csv` |
| Validation results | `python src/evaluate.py --run results/runs/edge_cnn` and `python src/quantize.py --run results/runs/edge_cnn` | rows in `results/metrics.csv`, `results/quantization.csv` |
| **Final test on DS2 (once)** | `python src/baseline.py --final`, `python src/evaluate.py --run results/runs/edge_cnn --final`, `python src/quantize.py --run results/runs/edge_cnn --final` | `results/metrics.csv`, `results/quantization.csv`, `results/confusion_matrix_*`, `results/errors/` |
| Noise test | `python src/noise_test.py --run results/runs/edge_cnn` | `results/noise_results.csv`, `results/noise_results.png` |
| MAX78002 toolchain | see `max78002/README.md` | `max78002/quantization_output/`, `max78002/synthesis_output/` |

Each step takes between 15 seconds and 10 minutes on a 2-core CPU. Preprocessing is deterministic;
training uses seed 42.

## 4. Preprocessing (all parameters in `configs/data.yaml`)

```
raw MLII (selected by NAME; record 114 stores MLII in channel 1)
 -> Butterworth band-pass 0.5-40 Hz, order 2, zero-phase (whole record)
 -> window 450 samples before / 270 after the annotated beat (360 Hz, 2.0 s)
 -> polyphase resampling 16/45 to 256 samples (128 Hz)
 -> subtract window median
 -> divide by 3 x record QRS-peak reference (median of max |filtered ECG| within +-50 ms of each beat)
 -> clip to [-1, 127/128]  (signed 8-bit input range of the MAX78002)
 -> add a second channel (index 1) = RR_pre / mean(previous 10 RR) - 1 (clipped)
 => model input 2 x 256
```

`prepare_data.py` stops with an error if the train, validation, test and excluded record lists overlap,
or if train + validation does not equal DS1 and test does not equal DS2.

## 5. Splits (record level: no beat from one record is in two splits)

| Split | Records |
|---|---|
| Train (DS1, 17) | 101 106 108 109 112 114 116 119 122 203 205 207 208 209 215 220 230 |
| Validation (DS1, 5) | 115 118 124 201 223 |
| Test (DS2, 22) | 100 103 105 111 113 117 121 123 200 202 210 212 213 214 219 221 222 228 231 232 233 234 |
| Excluded (paced) | 102 104 107 217 |

Records 201 (validation) and 202 (test) come from the same subject; 201 is kept out of training on purpose.
DS2 is read only by the `--final` commands and by `noise_test.py`.

## 6. Class mapping (AAMI EC57)

N ← N L R e j · S ← A a J S · V ← V E · F ← F · excluded: `/ f Q` and all non-beat annotations.

## 7. Noise

`src/ecg_noise.py` adds NSTDB `bw`, `ma`, `em` (or their equal-power mix) at 12/6/0 dB using the PhysioNet
`nst` SNR definition. Only the second half of each noise record is used for evaluation; the first half is
reserved. NSTDB noise is never used for training.
