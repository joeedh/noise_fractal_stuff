import {add_preset} from './hyperbolic_tiling.js';

// Heptagonal (7-fold) preset - simple spiral
add_preset([7.0, 3.0, 0.1, 0.4, 0, 0, 2.0, 2.0, 1.5, 0.5, 0.6, 0], {modulation_mode: 1});

// Octagonal (8-fold) preset - wave modulation
add_preset([8.0, 4.0, 0.15, 0.35, 0, 0, 2.5, 1.5, 2.0, 0.6, 0.5, 0], {modulation_mode: 2});

// Dodecagonal (12-fold) preset - rotation modulation
add_preset([12.0, 5.0, 0.12, 0.38, 0, 0, 3.0, 3.0, 1.0, 0.7, 0.7, 0], {modulation_mode: 3});

// High detail spiral
add_preset([7.0, 8.0, 0.08, 0.45, 0, 0, 1.8, 4.0, 2.5, 0.4, 0.8, 0], {modulation_mode: 1});
