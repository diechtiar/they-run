import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.theyran.run",
  appName: "THEY RUN",
  webDir: "apps/pwa/dist",
  android: {
    backgroundColor: "#11110f",
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
