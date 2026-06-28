export default class ENV {
    public static APP_URL = process.env.APP_URL ?? process.env.URL;
    public static AUTH_URL = process.env.AUTH_URL;
    public static DESK_URL = process.env.DESK_URL;
    public static CRM_URL = process.env.CRM_URL;

    // API testing — base URL + optional bearer token (falls back to APP_URL).
    public static API_BASE_URL = process.env.API_BASE_URL ?? ENV.APP_URL;
    public static API_TOKEN = process.env.API_TOKEN;

    // gRPC testing — target service (defaults point at the local mock server).
    public static GRPC_HOST = process.env.GRPC_HOST ?? "localhost";
    public static GRPC_PORT = Number(process.env.GRPC_PORT ?? 50051);
    public static GRPC_TLS = process.env.GRPC_TLS === "true";
    public static GRPC_TOKEN = process.env.GRPC_TOKEN;

    // Mobile (native Appium + optional cloud device grid).
    public static APPIUM_URL = process.env.APPIUM_URL ?? "http://127.0.0.1:4723";
    public static MOBILE_PLATFORM = process.env.MOBILE_PLATFORM; // "android" | "ios"
    public static DEVICE_GRID = process.env.DEVICE_GRID;          // "local" | "browserstack" | "saucelabs"
    public static MOBILE_APP = process.env.MOBILE_APP;            // path / URL / cloud app id of the build

    public static URL = ENV.APP_URL;
}
