import {add_preset} from './householder.js';

const color = 0.675

// degree 3, Halley (order 2), default view
/*1*/
add_preset([64, 0.0, 1.0, color, 3.0, 0.0, 0.0, 3.0, 1.0, 3.0, 2.0, 1.0, 0.5, 1.0]);

// degree 3, Newton (order 1)
/*2*/
add_preset([64, 0.0, 1.0, color, 3.0, 0.0, 0.0, 3.0, 1.0, 3.0, 1.0, 1.0, 0.5, 1.0]);

// degree 3, Householder order 3
/*3*/
add_preset([64, 0.0, 1.0, color, 3.0, 0.0, 0.0, 3.0, 1.0, 3.0, 3.0, 1.0, 0.5, 1.0]);

// degree 5, Halley, twisted
/*4*/
add_preset([80, 0.3, 1.0, color, 3.0, 0.0, 0.0, 3.0, 1.0, 5.0, 2.0, 1.0, 0.7, 2.0]);

// degree 7, Halley
/*5*/
add_preset([80, 0.0, 1.0, color, 3.0, 0.0, 0.0, 3.0, 1.0, 7.0, 2.0, 1.0, 0.5, 1.0]);

// degree 4, over-damped (damping > 1)
/*6*/
add_preset([100, 0.0, 1.0, color, 3.0, 0.0, 0.0, 3.0, 1.0, 4.0, 2.0, 1.3, 0.5, 1.0]);

// degree 6, Householder-3, iter-dominant coloring
/*7*/
add_preset([120, 0.0, 1.0, color, 2.5, 0.0, 0.0, 4.0, 1.0, 6.0, 3.0, 1.0, 0.1, 3.0]);

// degree 3, Halley, under-damped chaos
/*8*/
add_preset([150, 0.5, 1.0, color, 4.0, 0.0, 0.0, 5.0, 1.0, 3.0, 2.0, 0.7, 0.5, 1.0]);
