export default class ENV {
    public static APP_URL = process.env.APP_URL ?? process.env.URL;
    public static AUTH_URL = process.env.AUTH_URL;
    public static DESK_URL = process.env.DESK_URL;
    public static CRM_URL = process.env.CRM_URL;
    public static URL = ENV.APP_URL;
}
