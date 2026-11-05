import yaml
import os
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from IPython.display import HTML

class Config:
    """Loads simulation parameters from config.yaml."""
    def __init__(self):
        config_path = os.path.join(os.path.dirname(__file__), '..', 'common', 'config.yaml')
        with open(config_path, 'r') as f:
            full_config = yaml.safe_load(f)
        
        # Extract data section and set as attributes
        data_config = full_config.get('data', {})
        for key, value in data_config.items():
            setattr(self, key, value)

class BaseMotionGenerator:
    """Base class for event-based motion generators."""
    def __init__(self, config):
        self.config = config
    
    def generate(self, direction):
        events = self._generate_trajectory(direction)
        
        if self.config.noise_rate > 0:
            events = self._add_noise(events)
        
        if self.config.dropout_rate > 0:
            events = self._apply_dropout(events)
        
        events = events[events[:, 0].argsort()]
        return events
    
    def _generate_trajectory(self, direction):
        raise NotImplementedError("Subclasses must implement _generate_trajectory")
    
    def _add_noise(self, events):
        num_noise = int(len(events) * self.config.noise_rate)
        if num_noise == 0:
            return events
        
        max_t = events[:, 0].max()
        noise_events = np.column_stack([
            np.random.uniform(0, max_t, num_noise),
            np.random.randint(0, self.config.width, num_noise),
            np.random.randint(0, self.config.height, num_noise) if self.config.use_2d else np.zeros(num_noise),
            np.random.choice([0, 1], num_noise)
        ])
        return np.vstack([events, noise_events])
    
    def _apply_dropout(self, events):
        mask = np.random.random(len(events)) > self.config.dropout_rate
        return events[mask]

class LinearMotionGenerator(BaseMotionGenerator):
    """Generates linear left/right motion events."""
    def _generate_trajectory(self, direction):
        cfg = self.config
        dt = cfg.time_resolution
        num_steps = int(cfg.duration / dt)
        
        speed = cfg.speed
        if cfg.speed_variation > 0:
            speed += np.random.uniform(-cfg.speed_variation, cfg.speed_variation)
        
        x = cfg.pattern_size if direction == 1 else cfg.width - cfg.pattern_size - 1
        y = cfg.height // 2 if cfg.use_2d else 0
        
        events = []
        prev_x = None
        
        for step in range(num_steps):
            t = step * dt * 1e6
            x += direction * speed * dt
            
            if x < cfg.pattern_size or x >= cfg.width - cfg.pattern_size:
                break
            
            curr_x = int(x)
            if prev_x is not None and curr_x != prev_x:
                events.append([t, curr_x, y, 1])
                events.append([t, prev_x, y, 0])
            prev_x = curr_x
        
        return np.array(events, dtype=np.float32)

class CircularMotionGenerator(BaseMotionGenerator):
    """Generates circular CW/CCW motion events."""
    def __init__(self, config, radius=None):
        super().__init__(config)
        self.radius = radius or min(config.width, config.height) // 3
    
    def _generate_trajectory(self, direction):
        cfg = self.config
        if not cfg.use_2d:
            raise ValueError("Circular motion requires use_2d=True")
        
        dt = cfg.time_resolution
        num_steps = int(cfg.duration / dt)
        
        speed = cfg.speed
        if cfg.speed_variation > 0:
            speed += np.random.uniform(-cfg.speed_variation, cfg.speed_variation)
        
        cx, cy = cfg.width // 2, cfg.height // 2
        events = []
        prev_x, prev_y = None, None
        angle = 0
        
        for step in range(num_steps):
            t = step * dt * 1e6
            angular_speed = speed / self.radius
            angle += direction * angular_speed * dt
            
            curr_x = int(cx + self.radius * np.cos(angle))
            curr_y = int(cy + self.radius * np.sin(angle))
            
            if not (0 <= curr_x < cfg.width and 0 <= curr_y < cfg.height):
                continue
            
            if prev_x is not None and (curr_x != prev_x or curr_y != prev_y):
                events_list = [[t, curr_x, curr_y, 1], [t, prev_x, prev_y, 0]]
                events.extend(events_list)
            
            prev_x, prev_y = curr_x, curr_y
        
        return np.array(events, dtype=np.float32)

class Visualizer:
    """Handles event visualization and animation."""
    def __init__(self, height=128, width=128):
        self.height = height
        self.width = width
    
    def plot_events(self, events, title="Events"):
        plt.figure(figsize=(8, 6))
        colors = ['red' if p == 0 else 'blue' for p in events[:, 3]]
        plt.scatter(events[:, 1], events[:, 2], c=colors, s=1, alpha=0.5)
        plt.xlabel('x')
        plt.ylabel('y')
        plt.title(title)
        plt.show()
    
    def events_to_frames(self, events, bin_size_ms=10):
        bin_size_us = bin_size_ms * 1000
        max_t = events[:, 0].max()
        num_frames = int(max_t / bin_size_us) + 1
        # RGB frames: channel 0=R, 1=G, 2=B
        frames = np.zeros((num_frames, self.height, self.width, 3), dtype=np.float32)
        
        for event in events:
            t, x, y, pol = event
            frame_idx = int(t / bin_size_us)
            if 0 <= int(y) < self.height and 0 <= int(x) < self.width:
                if pol:  # ON event = Blue
                    frames[frame_idx, int(y), int(x)] = [0.2, 0.6, 1.0]
                else:    # OFF event = Red
                    frames[frame_idx, int(y), int(x)] = [1.0, 0.2, 0.2]
        return frames
    
    def animate(self, events, bin_size_ms=10, interval=50, title="Animation", show=True, save_path=None):
        frames = self.events_to_frames(events, bin_size_ms)
        fig, ax = plt.subplots(figsize=(6, 6))
        fig.patch.set_facecolor('#1a1a2e')
        ax.set_facecolor('#1a1a2e')
        im = ax.imshow(frames[0])
        ax.set_title(f"{title} - Frame 0/{len(frames)}", color='white', fontsize=12)
        ax.tick_params(colors='white')
        
        def update(i):
            im.set_data(frames[i])
            ax.set_title(f"{title} - Frame {i}/{len(frames)}", color='white', fontsize=12)
            return [im]
        
        ani = FuncAnimation(fig, update, frames=len(frames), interval=interval, blit=True)
        
        if save_path:
            os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
            ani.save(save_path, writer='pillow')
            print(f"Animation saved to: {save_path}")

        if show:
            plt.show()
            return ani
        else:
            plt.close(fig)
            return HTML(ani.to_jshtml())

class Data:
    """Main interface for generating, loading, and splitting event datasets."""
    def __init__(self):
        self.config = Config()
    
    def get(self, source, num_samples):
        if source == "linear":
            return self._generate("linear", num_samples)
        elif source == "circular":
            return self._generate("circular", num_samples)
        elif source == "dvs128":
            return self._load_dvs128(num_samples)
        else:
            raise ValueError(f"Unknown source: {source}")
    
    def _generate(self, motion_type, num_samples):
        if motion_type == "linear":
            generator = LinearMotionGenerator(self.config)
            dir_map = {"left": -1, "right": 1}
        elif motion_type == "circular":
            generator = CircularMotionGenerator(self.config)
            # Corrected: In image coords (y-down), +1 is CW, -1 is CCW
            dir_map = {"ccw": -1, "cw": 1}
        
        dirs_to_gen = self.config.directions
        if "both" in dirs_to_gen:
            dirs_to_gen = ["left", "right"] if motion_type == "linear" else ["ccw", "cw"]
        
        events_list, labels = [], []
        samples_per_dir = num_samples // len(dirs_to_gen)
        
        for d_name in dirs_to_gen:
            d_val = dir_map[d_name]
            label = 0 if d_name in ["left", "ccw"] else 1
            for _ in range(samples_per_dir):
                events_list.append(generator.generate(direction=d_val))
                labels.append(label)
        
        return events_list, np.array(labels)
    
    def _load_dvs128(self, num_samples):
        # Memory cache - load once, reuse
        if not hasattr(self, '_dvs128_cache'):
            base_path = getattr(self.config, 'dvs128_path', 'data')
            base_path = os.path.join(os.path.dirname(__file__), base_path)
            cache_path = os.path.join(base_path, "dvs128_all.npz")
        
            # If .npz cache exists, load into memory
            if os.path.exists(cache_path):
                print(f"Loading DVS128 data from {cache_path}...")
                self._dvs128_cache = self.load(cache_path)
                print(f"Loaded {len(self._dvs128_cache[0])} samples into memory.")
            else:
                # Otherwise, parse using tonic and create cache
                try:
                    import tonic
                    import shutil
                except ImportError:
                    raise ImportError("Please install tonic: pip install tonic")
            
                print("Parsing DVS128 train+test data from .tar.gz")
            
                tonic_dir = os.path.join(base_path, 'DVSGesture')
                os.makedirs(tonic_dir, exist_ok=True)
            
                # Copy tar.gz files into tonic's expected directory
                for tar_name in ["ibmGestureTrain.tar.gz", "ibmGestureTest.tar.gz"]:
                    src = os.path.join(base_path, tar_name)
                    dst = os.path.join(tonic_dir, tar_name)
                    if os.path.exists(src) and not os.path.exists(dst):
                        shutil.copy2(src, dst)
            
                events_list, labels = [], []
                try:
                    for split in [True, False]:
                        dataset = tonic.datasets.DVSGesture(save_to=base_path, train=split)
                        for i in range(len(dataset)):
                            events, label = dataset[i]
                            sample_events = np.column_stack((
                                events['t'].astype(np.float32),
                                events['x'].astype(np.float32),
                                events['y'].astype(np.float32),
                                events['p'].astype(np.float32)
                            ))
                            if len(sample_events) > 0:
                                sample_events[:, 0] -= sample_events[0, 0]
                                events_list.append(sample_events)
                                labels.append(label)
                except Exception as e:
                    print(f"Dataset loading failed: {e}")
                    self._dvs128_cache = ([], np.array([]))
                    return [], np.array([])
            
                labels = np.array(labels)
            
                # Cache to disk
                self.save(cache_path, events_list, labels)
                print(f"Cached {len(events_list)} DVS128 samples to {cache_path}")
            
                # Cache to memory
                self._dvs128_cache = (events_list, labels)
    
        # Return random samples from memory cache
        events_list, labels = self._dvs128_cache
        indices = np.random.choice(len(events_list), num_samples, replace=True)
        return [events_list[i] for i in indices], np.array([labels[i] for i in indices])
    
    def save(self, path, events_list, labels):
        np.savez(path, events=np.array(events_list, dtype=object), labels=labels)
    
    def load(self, path):
        file = np.load(path, allow_pickle=True)
        return list(file['events']), file['labels']
    
    def split(self, events_list, labels, ratios=(0.7, 0.15, 0.15)):
        assert abs(sum(ratios) - 1.0) < 1e-6, "Ratios must sum to 1"
        n = len(events_list)
        indices = np.random.permutation(n)
        train_end = int(n * ratios[0])
        val_end = train_end + int(n * ratios[1])
        
        train_idx, val_idx, test_idx = indices[:train_end], indices[train_end:val_end], indices[val_end:]
        return (
            ([events_list[i] for i in train_idx], labels[train_idx]),
            ([events_list[i] for i in val_idx], labels[val_idx]),
            ([events_list[i] for i in test_idx], labels[test_idx])
        )
    
    def info(self, events_list, labels):
        num_samples = len(events_list)
        label_counts = {int(l): int(c) for l, c in zip(*np.unique(labels, return_counts=True))}
        avg_events = np.mean([len(e) for e in events_list])
        
        print(f"Samples: {num_samples}")
        print(f"Labels: {label_counts}")
        print(f"Avg events/sample: {avg_events:.1f}")
        
        if num_samples > 0:
            print("\nSample Data (First 10 events of sample 0):")
            print(f"{'Time (us)':<10} | {'X':<3} | {'Y':<3} | Pol")
            print("-" * 30)
            for row in events_list[0][:10]:
                print(f"{int(row[0]):<10} | {int(row[1]):<3} | {int(row[2]):<3} | {int(row[3])}")
    
    def visualize(self, events, title="Events", show=True):
        """Animates events and automatically saves to the visualizations folder."""
        # Sanitize title for filename
        filename = title.lower().replace(" ", "_").replace(":", "").replace("(", "").replace(")", "")
        save_path = os.path.join("visualizations", f"{filename}.gif")
        
        viz = Visualizer(height=self.config.height, width=self.config.width)
        return viz.animate(events, title=title, show=show, save_path=save_path)

if __name__ == "__main__":
    data = Data()
    os.makedirs("data", exist_ok=True)
    
    # 1. Linear Motion
    print("--- 1. Linear Motion ---")
    lin_events, lin_labels = data.get(source="linear", num_samples=1341)
    data.info(lin_events, lin_labels)
    
    lin_train, lin_val, lin_test = data.split(lin_events, lin_labels)
    print(f"Linear Split: Train={len(lin_train[0])}, Val={len(lin_val[0])}, Test={len(lin_test[0])}")
    
    data.save("data/linear_train.npz", lin_train[0], lin_train[1])
    data.save("data/linear_val.npz", lin_val[0], lin_val[1])
    data.save("data/linear_test.npz", lin_test[0], lin_test[1])

    loaded_lin_events, loaded_lin_labels = data.load("data/linear_train.npz")
    print(f"Successfully saved/loaded {len(loaded_lin_events)} linear samples.")

    loaded_lin_events, loaded_lin_labels = data.load("data/linear_val.npz")
    print(f"Successfully saved/loaded {len(loaded_lin_events)} linear val samples.")

    loaded_lin_events, loaded_lin_labels = data.load("data/linear_test.npz")
    print(f"Successfully saved/loaded {len(loaded_lin_events)} linear test samples.\n")

    # 2. Circular Motion
    print("--- 2. Circular Motion ---")
    circ_events, circ_labels = data.get(source="circular", num_samples=1341)
    data.info(circ_events, circ_labels)
    
    circ_train, circ_val, circ_test = data.split(circ_events, circ_labels)
    print(f"Circular Split: Train={len(circ_train[0])}, Val={len(circ_val[0])}, Test={len(circ_test[0])}")
    
    data.save("data/circular_train.npz", circ_train[0], circ_train[1])
    data.save("data/circular_val.npz", circ_val[0], circ_val[1])
    data.save("data/circular_test.npz", circ_test[0], circ_test[1])
    
    loaded_circ_events, loaded_circ_labels = data.load("data/circular_train.npz")
    print(f"Successfully saved/loaded {len(loaded_circ_events)} circular samples.\n")

    loaded_circ_events, loaded_circ_labels = data.load("data/circular_val.npz")
    print(f"Successfully saved/loaded {len(loaded_circ_events)} circular val samples.")

    loaded_circ_events, loaded_circ_labels = data.load("data/circular_test.npz")
    print(f"Successfully saved/loaded {len(loaded_circ_events)} circular test samples.\n")

    # 3. Visualize & Save (Automatically titled)
    print("--- 3. Visualizing & Saving Motion ---")
    
    # Linear: 0 is Left, 10 is Right
    data.visualize(lin_events[0], title="Linear Left")
    data.visualize(lin_events[10], title="Linear Right")
    
    # Circular: 0 is CCW, 10 is CW
    data.visualize(circ_events[0], title="Circular CCW")
    data.visualize(circ_events[10], title="Circular CW")

    # 4. DVS128 Gesture
    print("--- 4. DVS128 Gesture ---")
    dvs_events, dvs_labels = data.get(source="dvs128", num_samples=1341)
    data.info(dvs_events, dvs_labels)
    
    dvs_train, dvs_val, dvs_test = data.split(dvs_events, dvs_labels, ratios=(0.8, 0.1, 0.1))
    print(f"DVS128 Split: Train={len(dvs_train[0])}, Val={len(dvs_val[0])}, Test={len(dvs_test[0])}\n")

    data.save("data/dvs128_train.npz", dvs_train[0], dvs_train[1])
    data.save("data/dvs128_val.npz", dvs_val[0], dvs_val[1])
    data.save("data/dvs128_test.npz", dvs_test[0], dvs_test[1])

    loaded_dvs_events, loaded_dvs_labels = data.load("data/dvs128_train.npz")
    print(f"Successfully saved/loaded {len(loaded_dvs_events)} DVS128 samples.\n")

    loaded_dvs_events, loaded_dvs_labels = data.load("data/dvs128_val.npz")
    print(f"Successfully saved/loaded {len(loaded_dvs_events)} DVS128 val samples.")

    loaded_dvs_events, loaded_dvs_labels = data.load("data/dvs128_test.npz")
    print(f"Successfully saved/loaded {len(loaded_dvs_events)} DVS128 test samples.\n")

    # Visualize samples
    data.visualize(dvs_events[0], title="DVS Sample 1")
    data.visualize(dvs_events[1], title="DVS Sample 2")
    data.visualize(dvs_events[2], title="DVS Sample 3")
    data.visualize(dvs_events[3], title="DVS Sample 4")
    data.visualize(dvs_events[4], title="DVS Sample 5")
    data.visualize(dvs_events[5], title="DVS Sample 6")