# Visits module

Admins can upload floor plans and allow users to book desks in the office. The system also supports additional check-in forms.

## Manifest.json

| key                     | value                                    |
| ----------------------- | ---------------------------------------- |
| id                      | visits                                   |
| name                    | Visits                                   |
| dependencies            | users                                    |
| requiredIntegrations    | []                                       |
| recommendedIntegrations | matrix                                   |
| availableCronJobs       | "visit-delete-data", "visit-reminder:\*" |

## Available Widgets

This module provides functionality for desk booking but does not have specific desk booking widgets, as they are part of the booking flow, which start when user uses [Office vists module](./office-visits.md).

### Who is in Office

To enable - add the following to the [application.json](../framework/configuration/application.md) configuration.

```json
[
  "visits",
  "WhoIsInOffice",
  { "offices": ["sampleOfficeId-1", "sampleOfficeId-2"] }
]
```

The widget shows who is in the office on a given date. Using stealth mode the user can avoid being shown on that list.

<Image
  src="/modules/visitsWhoIsInOffice.png"
  alt="who is in office widget"
  width="500"
  height="500"
  style="border: 1px solid lightGray; border-radius: 10px; margin-top: 10px"
/>

## Configuration

### Floor plans

1. Floor plans are added to your `config/public` folder. You can create any folder structure that you like in that folder.
2. Adjust the source of floor plans for the specific floor in your [`company.json`](../framework/configuration/company.md) file.

```json
      "areas": [
        {
          "id": "parity_hq_1",
          "available": false,
          "name": "1st floor",
          "capacity": 5,
          "map": "/maps/berlin-1.png",
          "bookable": false,
          ....

```
