from brian2 import *
import numpy as np
import matplotlib.pyplot as plt
import os
import csv

defaultclock.dt = 0.1*ms

# ── Paths ─────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(SCRIPT_DIR, "data")
MODEL_DIR   = os.path.join(SCRIPT_DIR, "models_dvs")
CSV_PATH    = os.path.join(SCRIPT_DIR, "training_log.csv")

os.makedirs(MODEL_DIR, exist_ok=True)

train_path = os.path.join(DATA_DIR, "dvs128_train.npz")
val_path   = os.path.join(DATA_DIR, "dvs128_val.npz")

train_file   = np.load(train_path, allow_pickle=True)
val_file     = np.load(val_path,   allow_pickle=True)

events_list     = list(train_file['events'])
labels          = train_file['labels']
val_events_list = list(val_file['events'])
val_labels      = val_file['labels']

# ── Dataset debug ─────────────────────────────────────────────
print("\n===== Dataset Info =====")
print(f"Train samples     : {len(events_list)}")
print(f"Val   samples     : {len(val_events_list)}")
print(f"Label dtype       : {labels.dtype}")
print(f"Unique labels     : {sorted(np.unique(labels))}")
print(f"Label counts      : { {int(l): int((labels==l).sum()) for l in np.unique(labels)} }")
print(f"Label min/max     : {labels.min()} / {labels.max()}")
lengths = [len(np.array(e)) for e in events_list]
print(f"Events per sample : min={min(lengths)}, max={max(lengths)}, mean={np.mean(lengths):.0f}")
print("========================\n")

# ── Grid size ─────────────────────────────────────────────────
all_events = events_list + val_events_list
x_max = max(int(np.array(e, dtype=np.float64)[:, 1].max()) for e in all_events) + 1
y_max = max(int(np.array(e, dtype=np.float64)[:, 2].max()) for e in all_events) + 1
num_input  = x_max * y_max
num_output = int(labels.max()) + 1
num_hidden = max(128, num_output * 10)

print(f"Input grid : {x_max} x {y_max} = {num_input} neurons")
print(f"num_output : {num_output}")
print(f"num_hidden : {num_hidden}")

# ── Neuron model ──────────────────────────────────────────────
neuron_eqs = '''
    dv/dt = (-v + I) / tau : 1 (unless refractory)
    I     : 1
'''
tau          = 20*ms
v_thresh     = 1.0
v_reset      = 0.0
t_refractory = 5*ms

# ── STDP parameters ───────────────────────────────────────────
tau_pre  = 20*ms
tau_post = 20*ms
A_plus   =  0.005
A_minus  = -0.00525
w_max    =  1.0
w_min    =  0.0

# ── Readout ───────────────────────────────────────────────────
W_out  = np.random.uniform(0.0, 0.1, (num_hidden, num_output))
lr_out = 0.005

# ── STDP weights — persist across samples ────────────────────
stdp_weights = np.random.uniform(0.0, 0.1, (num_input, num_hidden))
DT_S = float(defaultclock.dt / second)

# ── CSV initialisation ────────────────────────────────────────
write_header = not os.path.exists(CSV_PATH)
csv_file   = open(CSV_PATH, "a", newline="")
csv_writer = csv.writer(csv_file)
if write_header:
    csv_writer.writerow(["epoch", "loss", "val_acc"])
    csv_file.flush()

# ── How often to save a model checkpoint (in samples) ─────────
SAVE_EVERY = 10

# ── Helpers ───────────────────────────────────────────────────
def preprocess_events(events, x_max):
    events    = np.array(events, dtype=np.float64)
    xs        = events[:, 1].astype(int)
    ys        = events[:, 2].astype(int)
    idx       = ys * x_max + xs
    times     = events[:, 0] * 1e-6
    bins      = np.floor(times / DT_S).astype(np.int64)
    snapped_t = bins * DT_S
    pairs        = np.stack([idx, bins], axis=1)
    _, first_occ = np.unique(pairs, axis=0, return_index=True)
    idx       = idx[first_occ]
    snapped_t = snapped_t[first_occ]
    order = np.argsort(snapped_t)
    return idx[order], snapped_t[order] * second

def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()

def run_sample(events, x_max, num_input, num_hidden, stdp_weights, learn_stdp=True):
    neuron_indices, spike_times = preprocess_events(events, x_max)
    duration = float(spike_times.max() / second) * second + 50*ms

    input_group = SpikeGeneratorGroup(
        num_input, neuron_indices, spike_times, sorted=True
    )
    hidden = NeuronGroup(
        num_hidden, neuron_eqs,
        threshold=f'v > {v_thresh}',
        reset=f'v = {v_reset}',
        refractory=t_refractory,
        method='euler'
    )
    hidden.v = 0.0
    hidden.I = 0.0

    if learn_stdp:
        S = Synapses(
            input_group, hidden,
            '''
            w         : 1
            dApre/dt  = -Apre  / tau_pre  : 1 (event-driven)
            dApost/dt = -Apost / tau_post : 1 (event-driven)
            ''',
            on_pre='''
            I_post   += w
            Apre     += A_plus
            w         = clip(w + Apost, w_min, w_max)
            ''',
            on_post='''
            Apost    += A_minus
            w         = clip(w + Apre,  w_min, w_max)
            ''',
            namespace=dict(tau_pre=tau_pre, tau_post=tau_post,
                           A_plus=A_plus, A_minus=A_minus,
                           w_min=w_min, w_max=w_max)
        )
    else:
        S = Synapses(input_group, hidden, 'w : 1', on_pre='I_post += w')

    S.connect()
    S.w = stdp_weights.flatten()

    inh = Synapses(hidden, hidden, on_pre='I_post -= 5.0', delay=1*ms)
    inh.connect(condition='i != j')

    mon = SpikeMonitor(hidden)
    net = Network(input_group, hidden, S, inh, mon)
    net.run(duration)

    counts = np.array(mon.count[:], dtype=float)
    new_w  = np.array(S.w[:]).reshape(num_input, num_hidden) if learn_stdp else stdp_weights
    return counts, new_w

def evaluate(events_list, labels, stdp_weights, W_out, x_max, num_input, num_hidden, desc="Val"):
    """Run inference on a dataset and return accuracy."""
    correct = 0
    n = len(events_list)
    for i, events in enumerate(events_list):
        counts, _ = run_sample(events, x_max, num_input, num_hidden,
                               stdp_weights, learn_stdp=False)
        feat  = np.log1p(counts)
        feat  = feat / (feat.sum() + 1e-8)
        probs = softmax(feat @ W_out)
        pred  = int(np.argmax(probs))
        if pred == int(labels[i]):
            correct += 1
        if (i + 1) % 10 == 0 or (i + 1) == n:
            print(f"  [{desc}] {i+1}/{n}  running acc: {correct/(i+1)*100:.1f}%")
    return correct / n

# ── Training ──────────────────────────────────────────────────
num_epochs      = 10
loss_history    = []
val_acc_history = []

for epoch in range(num_epochs):
    print(f"\n{'='*55}")
    print(f"  EPOCH {epoch}  —  training on {len(events_list)} samples")
    print(f"  Checkpoints saved every {SAVE_EVERY} samples  →  "
          f"{len(events_list) // SAVE_EVERY} checkpoints/epoch")
    print(f"{'='*55}")

    epoch_loss = 0.0
    correct    = 0
    n_train    = len(events_list)

    for sample_idx, events in enumerate(events_list):
        counts, stdp_weights = run_sample(
            events, x_max, num_input, num_hidden, stdp_weights, learn_stdp=True
        )

        feat   = np.log1p(counts)
        feat   = feat / (feat.sum() + 1e-8)
        logits = feat @ W_out
        probs  = softmax(logits)

        y_true      = int(labels[sample_idx])
        loss        = -np.log(probs[y_true] + 1e-12)
        epoch_loss += loss

        one_hot         = np.zeros(num_output)
        one_hot[y_true] = 1.0
        grad            = probs - one_hot
        W_out          -= lr_out * np.outer(feat, grad)

        pred = int(np.argmax(probs))
        if pred == y_true:
            correct += 1

        # ── Print + checkpoint every SAVE_EVERY samples ──────
        is_checkpoint = (sample_idx + 1) % SAVE_EVERY == 0 or (sample_idx + 1) == n_train
        if is_checkpoint:
            running_acc = correct / (sample_idx + 1) * 100
            top3_idx    = np.argsort(probs)[::-1][:3]
            top3_str    = " ".join([f"{i}:{probs[i]:.2f}" for i in top3_idx])
            print(f"  [Train] {sample_idx+1:4d}/{n_train} | "
                  f"spikes: {int(counts.sum()):6d} | "
                  f"active: {int((counts>0).sum()):3d}/{num_hidden} | "
                  f"top3: [{top3_str}] | "
                  f"pred: {pred} true: {y_true} | "
                  f"loss: {loss:.3f} | "
                  f"run-acc: {running_acc:.1f}%")

            # Save checkpoint — filename: model_e000_s0010.npz
            ckpt_path = os.path.join(
                MODEL_DIR,
                f"model_e{epoch:03d}_s{sample_idx+1:04d}.npz"
            )
            np.savez(ckpt_path,
                     stdp_weights=stdp_weights,
                     W_out=W_out,
                     epoch=epoch,
                     sample=sample_idx + 1,
                     running_loss=epoch_loss / (sample_idx + 1),
                     running_acc=running_acc / 100)
            print(f"           └─ checkpoint saved: {os.path.basename(ckpt_path)}")

    avg_loss  = epoch_loss / n_train
    train_acc = correct / n_train
    loss_history.append(avg_loss)

    print(f"\n  --> Train avg loss: {avg_loss:.4f}  |  Train acc: {train_acc*100:.1f}%")

    # ── Validation pass (once per epoch) ─────────────────────
    print(f"\n  Running validation ({len(val_events_list)} samples)...")
    val_acc = evaluate(val_events_list, val_labels,
                       stdp_weights, W_out,
                       x_max, num_input, num_hidden, desc="Val")
    val_acc_history.append(val_acc)
    print(f"  --> Val acc: {val_acc*100:.2f}%")

    # ── Append to CSV (once per epoch) ───────────────────────
    csv_writer.writerow([epoch, f"{avg_loss:.6f}", f"{val_acc:.6f}"])
    csv_file.flush()
    print(f"  --> CSV updated: {CSV_PATH}")

csv_file.close()

# ── Final evaluation on validation set ────────────────────────
print("\n===== Final Evaluation (Validation Set) =====")
final_val_acc = evaluate(val_events_list, val_labels,
                         stdp_weights, W_out,
                         x_max, num_input, num_hidden, desc="FinalVal")
print(f"Final val accuracy : {final_val_acc*100:.2f}%")
print(f"Random baseline    : {100/num_output:.1f}%")

# ── Plot ──────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(11, 4))

axes[0].plot(loss_history, marker='o')
axes[0].axhline(y=-np.log(1/num_output), color='red', linestyle='--',
                label=f'random baseline ({-np.log(1/num_output):.2f})')
axes[0].legend()
axes[0].set_xlabel('Epoch')
axes[0].set_ylabel('Avg cross-entropy loss')
axes[0].set_title('Training Loss')

axes[1].plot([a * 100 for a in val_acc_history], marker='s', color='green')
axes[1].axhline(y=100/num_output, color='red', linestyle='--',
                label=f'random baseline ({100/num_output:.1f}%)')
axes[1].legend()
axes[1].set_xlabel('Epoch')
axes[1].set_ylabel('Val Accuracy (%)')
axes[1].set_title('Validation Accuracy')
axes[1].set_ylim(0, 105)

plt.tight_layout()
plot_path = os.path.join(SCRIPT_DIR, "training_curves.png")
plt.savefig(plot_path, dpi=150)
plt.show()
print(f"Plot saved to {plot_path}")
