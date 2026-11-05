from brian2 import *
import numpy as np
import matplotlib.pyplot as plt
import os
import glob

defaultclock.dt = 0.1*ms

# ── Paths ─────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(SCRIPT_DIR, "data")
MODEL_DIR  = os.path.join(SCRIPT_DIR, "models_dvs")

test_path  = os.path.join(DATA_DIR, "dvs128_test.npz")
test_file  = np.load(test_path, allow_pickle=True)
test_events = list(test_file['events'])
test_labels = test_file['labels']

print(f"\n===== Test Set Info =====")
print(f"Test samples  : {len(test_events)}")
print(f"Unique labels : {sorted(np.unique(test_labels))}")
print(f"=========================\n")

# ── Find all saved checkpoints, sorted by epoch then sample ───
model_files = sorted(glob.glob(os.path.join(MODEL_DIR, "model_e*_s*.npz")))
if not model_files:
    raise FileNotFoundError(f"No checkpoint files found in {MODEL_DIR}")
print(f"Found {len(model_files)} checkpoint(s) in {MODEL_DIR}\n")

# ── Peek at first checkpoint for architecture constants ───────
_peek      = np.load(model_files[0], allow_pickle=True)
num_hidden = _peek['W_out'].shape[0]
num_output = _peek['W_out'].shape[1]

# ── Grid size ─────────────────────────────────────────────────
x_max = max(int(np.array(e, dtype=np.float64)[:, 1].max()) for e in test_events) + 1
y_max = max(int(np.array(e, dtype=np.float64)[:, 2].max()) for e in test_events) + 1
num_input = x_max * y_max

print(f"Input grid : {x_max} x {y_max} = {num_input} neurons")
print(f"num_hidden : {num_hidden}  |  num_output : {num_output}\n")

# ── Neuron model ──────────────────────────────────────────────
neuron_eqs = '''
    dv/dt = (-v + I) / tau : 1 (unless refractory)
    I     : 1
'''
tau          = 20*ms
v_thresh     = 1.0
v_reset      = 0.0
t_refractory = 5*ms
DT_S         = float(defaultclock.dt / second)

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
    order     = np.argsort(snapped_t)
    return idx[order], snapped_t[order] * second

def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()

def run_sample_inference(events, x_max, num_input, num_hidden, stdp_weights):
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

    S = Synapses(input_group, hidden, 'w : 1', on_pre='I_post += w')
    S.connect()
    S.w = stdp_weights.flatten()

    inh = Synapses(hidden, hidden, on_pre='I_post -= 5.0', delay=1*ms)
    inh.connect(condition='i != j')

    mon = SpikeMonitor(hidden)
    net = Network(input_group, hidden, S, inh, mon)
    net.run(duration)

    return np.array(mon.count[:], dtype=float)

# ── Evaluate each checkpoint ──────────────────────────────────
results = []
n_test  = len(test_events)

for model_path in model_files:
    data         = np.load(model_path, allow_pickle=True)
    stdp_weights = data['stdp_weights']
    W_out        = data['W_out']
    epoch        = int(data['epoch'])
    sample       = int(data['sample'])
    saved_loss   = float(data['running_loss'])
    saved_acc    = float(data['running_acc'])
    label        = f"e{epoch:03d}_s{sample:04d}"

    print(f"{'='*60}")
    print(f"  Checkpoint {label}  |  running loss: {saved_loss:.4f}  "
          f"|  running train acc: {saved_acc*100:.1f}%")
    print(f"{'='*60}")

    correct = 0
    for si, events in enumerate(test_events):
        counts = run_sample_inference(
            events, x_max, num_input, num_hidden, stdp_weights
        )
        feat  = np.log1p(counts)
        feat  = feat / (feat.sum() + 1e-8)
        probs = softmax(feat @ W_out)
        pred  = int(np.argmax(probs))
        true  = int(test_labels[si])
        if pred == true:
            correct += 1

        if (si + 1) % 10 == 0 or (si + 1) == n_test:
            top3_idx = np.argsort(probs)[::-1][:3]
            top3_str = " ".join([f"{j}:{probs[j]:.2f}" for j in top3_idx])
            print(f"  [Test] {si+1:4d}/{n_test} | "
                  f"spikes: {int(counts.sum()):6d} | "
                  f"active: {int((counts>0).sum()):3d}/{num_hidden} | "
                  f"top3: [{top3_str}] | "
                  f"pred: {pred} true: {true} | "
                  f"run-acc: {correct/(si+1)*100:.1f}%")

    test_acc = correct / n_test
    results.append((label, epoch, sample, test_acc))
    print(f"\n  --> Test accuracy {label}: {test_acc*100:.2f}%\n")

# ── Summary table ─────────────────────────────────────────────
print("\n===== Summary =====")
print(f"{'Checkpoint':<16}  {'Test Acc':>10}")
print("-" * 30)
best_label, _, _, best_acc = max(results, key=lambda x: x[3])
for label, epoch, sample, acc in results:
    marker = "  <-- best" if label == best_label else ""
    print(f"{label:<16}  {acc*100:>9.2f}%{marker}")
print(f"\nRandom baseline : {100/num_output:.1f}%")
print("===================\n")

# ── Plot ──────────────────────────────────────────────────────
labels_x = [r[0] for r in results]
accs     = [r[3] * 100 for r in results]
x_pos    = list(range(len(results)))

fig, ax = plt.subplots(figsize=(max(10, len(results) * 0.4), 5))

ax.plot(x_pos, accs, marker='o', color='steelblue', linewidth=1.5, label='Test accuracy')
ax.axhline(y=100/num_output, color='red', linestyle='--',
           label=f'Random baseline ({100/num_output:.1f}%)')

best_pos = next(si for si, r in enumerate(results) if r[0] == best_label)
ax.scatter([best_pos], [best_acc * 100], color='gold', s=150, zorder=5,
           label=f'Best: {best_label} ({best_acc*100:.2f}%)')

# Draw vertical lines + epoch labels at epoch boundaries
seen_epochs = {}
for si, (_, epoch, sample, _) in enumerate(results):
    if epoch not in seen_epochs:
        seen_epochs[epoch] = si
        if si > 0:
            ax.axvline(x=si - 0.5, color='grey', linestyle=':', linewidth=0.8)
        ax.text(si, 104, f'E{epoch}', fontsize=7, color='grey', ha='left')

ax.set_xticks(x_pos)
ax.set_xticklabels(labels_x, rotation=45, ha='right', fontsize=7)
ax.set_ylabel('Test Accuracy (%)')
ax.set_title('Test Accuracy per Sample Checkpoint')
ax.set_ylim(0, 108)
ax.legend(fontsize=8)
ax.grid(True, alpha=0.3, axis='y')

plt.tight_layout()
plot_path = os.path.join(SCRIPT_DIR, "test_accuracy.png")
plt.savefig(plot_path, dpi=150)
plt.show()
print(f"Plot saved to {plot_path}")
