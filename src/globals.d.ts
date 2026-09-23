// Ambient types for tsc --checkJs only. Never shipped: lifelist.py builds the page from
// src/*.js alone, this file isn't in that list. L/Chart are loaded from a CDN at runtime
// (see charts.js/map.js); typing them fully would mean adding @types/leaflet and
// @types/chart.js as dev dependencies, which is more than this project's "no build step,
// no installed dependencies" tsc setup is meant to take on. `any` is deliberate.
declare var L: any;
declare var Chart: any;
