import { createContext, useContext, useEffect, type ReactNode } from "react";

export interface RestaurantTheme {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  bodyFontFamily: string;
  logoUrl: string;
  faviconUrl: string | null;
}

const defaultTheme: RestaurantTheme = {
  primaryColor: "#B95509",
  accentColor: "#4E750E",
  fontFamily: "'Playfair Display', serif",
  bodyFontFamily: "'Inter', sans-serif",
  logoUrl: "",
  faviconUrl: null,
};

const RestaurantThemeContext = createContext<RestaurantTheme>(defaultTheme);

export function useRestaurantTheme() {
  return useContext(RestaurantThemeContext);
}

interface Props {
  children: ReactNode;
  theme?: Partial<RestaurantTheme>;
}

export function RestaurantThemeProvider({ children, theme }: Props) {
  const merged: RestaurantTheme = { ...defaultTheme, ...theme };

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--color-primary", merged.primaryColor);
    root.style.setProperty("--color-accent", merged.accentColor);
    root.style.setProperty("--font-display", merged.fontFamily);
    root.style.setProperty("--font-body", merged.bodyFontFamily);

    if (merged.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = merged.faviconUrl;
    }

    return () => {
      root.style.removeProperty("--color-primary");
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--font-display");
      root.style.removeProperty("--font-body");
    };
  }, [merged.primaryColor, merged.accentColor, merged.fontFamily, merged.bodyFontFamily, merged.faviconUrl]);

  return (
    <RestaurantThemeContext.Provider value={merged}>
      {children}
    </RestaurantThemeContext.Provider>
  );
}
