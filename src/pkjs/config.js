module.exports = [
  {
    "type": "heading",
    "defaultValue": "Blood Pressure Diary"
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
          "placeholder": "sensor.bp_systolic"
        }
      },
      {
        "type": "input",
        "messageKey": "DiaEntity",
        "label": "Diastolic",
        "defaultValue": "",
        "attributes": {
          "placeholder": "sensor.bp_diastolic"
        }
      },
      {
        "type": "input",
        "messageKey": "RhrEntity",
        "label": "Resting heart rate",
        "defaultValue": "",
        "attributes": {
          "placeholder": "sensor.resting_heart_rate"
        }
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save settings"
  }
];