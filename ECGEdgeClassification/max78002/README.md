# MAX78002 toolchain (software-level deployment)

No MAX78002 board is used. These steps train the CNN with quantisation-aware training,
quantise it to INT8, check the INT8 accuracy with the device arithmetic simulated in
PyTorch, and generate the C code for the MAX78002. Nothing here is a hardware measurement.

## Files

```
model_configuration/
  ai85ecgnet.py       the CNN written with ai8x layers (same architecture as src/model.py)
  ecg_mitbih.py       dataset loader for the beats from src/prepare_data.py
  ecg_mitbih.yaml     network description for ai8x-synthesis
  qat_policy_ecg.yaml quantisation-aware training settings
  schedule_ecg.yaml   learning-rate schedule
quantization_output/  training log, quantize.py log, INT8 evaluation logs, checkpoints
synthesis_output/     generated C project (cnn.c, weights.h, main.c, ...) and the ai8xize log
int8_results.py       turns the INT8 confusion matrix into the project's metrics
```

## Set-up (Linux, Python 3.11)

```bash
git clone https://github.com/analogdevicesinc/ai8x-training.git  && (cd ai8x-training  && git checkout 2dfe594)
git clone https://github.com/analogdevicesinc/ai8x-synthesis.git && (cd ai8x-synthesis && git checkout 7379b29)
cd ai8x-training && git submodule update --init distiller
python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
cd ai8x-synthesis && python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
```

Copy the project files into the tools:

```bash
P=/path/to/ECGEdgeClassification
cp $P/max78002/model_configuration/ai85ecgnet.py ai8x-training/models/
cp $P/max78002/model_configuration/ecg_mitbih.py  ai8x-training/datasets/
cp $P/max78002/model_configuration/*_ecg.yaml     ai8x-training/policies/
cp $P/max78002/model_configuration/ecg_mitbih.yaml ai8x-synthesis/networks/
mkdir -p ai8x-training/data/ECG_MITBIH && cp $P/data/processed/*.npz ai8x-training/data/ECG_MITBIH/
export ECG_PROJECT_DIR=$P ECG_DATA_DIR=$PWD/ai8x-training/data/ECG_MITBIH
```

## 1. Train with quantisation-aware training (DS1 train, DS1 validation as "test")

```bash
cd ai8x-training
.venv/bin/python train.py --model ai85ecgnet --dataset ECG_MITBIH --device MAX78002 \
  --epochs 40 --optimizer Adam --lr 0.001 --wd 0.0001 --batch-size 256 \
  --compress policies/schedule_ecg.yaml --qat-policy policies/qat_policy_ecg.yaml \
  --validation-split 0 --use-bias --deterministic --confusion --name ecg
```

`--validation-split 0` keeps our record-level split (the loader uses the validation records as "test").
The tool keeps the checkpoint with the best accuracy (`ecg_qat_best.pth.tar`), which favours the N class;
we use the checkpoint of the last epoch instead: `logs/<run>/ecg_qat_checkpoint.pth.tar`, copied to
`quantization_output/ecg_qat.pth.tar`.

## 2. Quantise to INT8

```bash
cd ../ai8x-synthesis
.venv/bin/python quantize.py ../ai8x-training/logs/<run>/ecg_qat_checkpoint.pth.tar \
  ../ai8x-training/logs/<run>/ecg_qat-q.pth.tar --device MAX78002 -v
```

## 3. INT8 accuracy with the device arithmetic (validation, then DS2 once)

```bash
cd ../ai8x-training
.venv/bin/python train.py --model ai85ecgnet --dataset ECG_MITBIH --device MAX78002 --use-bias \
  --evaluate -8 --exp-load-weights-from logs/<run>/ecg_qat-q.pth.tar --confusion --save-sample 10
ECG_EVAL_SPLIT=ds2_test .venv/bin/python train.py --model ai85ecgnet --dataset ECG_MITBIH --device MAX78002 \
  --use-bias --evaluate -8 --exp-load-weights-from logs/<run>/ecg_qat-q.pth.tar --confusion
```

`--save-sample 10` writes `sample_ecg_mitbih.npy`, one known input used by the generated C code as a self-test.

## 4. Synthesise the C code

```bash
cp ../ai8x-training/sample_ecg_mitbih.npy ../ai8x-synthesis/tests/
cd ../ai8x-synthesis
.venv/bin/python ai8xize.py --no-version-check --device MAX78002 --test-dir $P/max78002/synthesis_output \
  --prefix ecg --checkpoint-file ../ai8x-training/logs/<run>/ecg_qat-q.pth.tar \
  --config-file networks/ecg_mitbih.yaml --sample-input tests/sample_ecg_mitbih.npy \
  --compact-data --mexpress --timer 0 --display-checkpoint --softmax --overwrite
```

The memory use and operation counts are printed in `synthesis_output/ecg/main.c`
(RESOURCE USAGE and SUMMARY OF OPS).
