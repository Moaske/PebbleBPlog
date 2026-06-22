# PebbleBPlog
Blood Pressure Log app for Pebble Emery watch. Gets data via Health Connect on Android en Home Assistant as intermediate.
v1.0.1 First working version, still work in progress :-)

Shows my Blood Pressure diary from a BT enabled BP cuff that writes it to Health Connect.

The chain to get in onto the watch:

-Cuff takes reading and syncs/saves to Health Connect on the Android phone

-Home Assistant app on phone exposes health metrics from Health Connect as sensors in HA

-Setup new Template sensors in HA to actually record these values

-Have the watch app read this sensor data through HA's REST api (needs HA instance URL, token and sensor ID's in de setup page on the phone companion for Pebble)
