module.exports = [
  {
    "type": "heading",
    "defaultValue": "Blood Pressure Log"
  },
  {
    "type": "text",
    "defaultValue": "Enter your Home Assistant details. Find entity IDs under Settings -> Devices & Services -> your Pixel."
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Home Assistant connection"
      },
      {
        "type": "input",
        "messageKey": "HaUrl",
        "label": "URL",
        "defaultValue": "",
        "attributes": {
          "placeholder": "https://xxxxx.ui.nabu.casa",
          "type": "url"
        }
      },
      {
        "type": "input",
        "messageKey": "HaToken",
        "label": "Access token",
        "defaultValue": "",
        "attributes": {
          "placeholder": "Long-lived access token",
          "type": "password"
        }
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Sensor entity IDs"
      },
      {
        "type": "input",
        "messageKey": "SysEntity",
        "label": "Systolic",
        "defaultValue": "",
        "attributes": {
          "placeholder": "sensor.pixel_blood_pressure_systolic"
        }
      },
      {
        "type": "input",
        "messageKey": "DiaEntity",
        "label": "Diastolic",
        "defaultValue": "",
        "attributes": {
          "placeholder": "sensor.pixel_blood_pressure_diastolic"
        }
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save settings"
  }
];