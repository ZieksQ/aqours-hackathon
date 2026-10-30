# Customer mobile map, weather, and notifications

## Mobile screens

- The Home screen opens the supplier map and weather outlook from compact secondary actions.
- The supplier map shows supplier site markers and each site's latest manually recorded Normal, Low, or Unavailable status, with update time. Customers may request a one-time current-location read; the app never reads GPS until the customer presses **Show my location**.
- The weather outlook shows each site's existing three-day forecast assessment, manual supply status, and missing/stale limitations. Open-Meteo attribution remains visible.
- Updates read state is account-scoped and stored by the server. The feed continues to derive report activity from the Customer's own reports and supplier messages; it does not create claim/resolution timestamps that the Customer API does not expose.
- Push permission is optional. The app registers its Expo push token after sign-in and removes it on sign-out when online. Supplier status changes and replies send a push containing the report ID; opening it links into the report details.

## Customer API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/customer/supply-sites` | Paginated supplier site pins and latest manual supply readings |
| GET | `/api/customer/weather/sites` | Existing three-day site forecast and risk assessments |
| GET | `/api/customer/notifications/read-state` | Notification event IDs marked read by the signed-in Customer |
| POST | `/api/customer/notifications/read-state` | Store a batch of read event IDs (up to 1,000) |
| POST | `/api/customer/notifications/devices` | Register an Expo push token for the signed-in Customer |
| POST | `/api/customer/notifications/devices/remove` | Remove that Customer's token on sign-out |

All routes require the completed Customer bearer policy. The site/weather routes expose no Customer report locations. Notification reads and device tokens are linked to the authenticated account and cascade on account deletion.

## Database and push setup

Migration `20261030040317_CustomerNotifications` creates `notification_reads` and `push_device_tokens`. Apply committed migrations explicitly to each target database from the repository root; API startup does not alter schemas:

```sh
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

Set `EXPO_PUBLIC_EAS_PROJECT_ID` and configure Expo push credentials for the app before registering devices. Real remote push requires platform credentials and a physical device. Expo Go does not support remote push on Android for SDK 53+, while this repository's mobile testing policy prohibits native/development builds; Android remote delivery therefore cannot be verified under the current policy. The in-app Updates feed and local notification handling remain available.
