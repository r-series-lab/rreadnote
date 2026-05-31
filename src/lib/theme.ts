import { alpha, createTheme } from "@mui/material/styles";

export type AppThemeMode = "dark" | "light";

export function createAppTheme(mode: AppThemeMode) {
  const isLight = mode === "light";
  const ink = isLight ? "#262a31" : "#f5f7fa";
  const inkMuted = isLight ? "#71777f" : "#98a0ab";
  const paper = isLight ? "#fffaf4" : "#15181d";
  const page = isLight ? "#f4efe8" : "#0b0d10";
  const accent = isLight ? "#b3674a" : "#f3f4f6";
  const accentInk = isLight ? "#fffaf4" : "#111318";

  return createTheme({
  palette: {
    mode,
    primary: {
      main: accent,
      contrastText: accentInk,
    },
    secondary: {
      main: isLight ? "#8b6f5c" : "#c3c8d0",
    },
    background: {
      default: page,
      paper,
    },
    text: {
      primary: ink,
      secondary: inkMuted,
    },
    divider: alpha(ink, isLight ? 0.12 : 0.12),
  },
  shape: {
    borderRadius: 20,
  },
  typography: {
    fontFamily:
      '"SF Pro Display", "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: "-0.04em",
    },
    h5: {
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
    h6: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    button: {
      textTransform: "none",
      fontWeight: 700,
      letterSpacing: "0.01em",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: isLight
            ? "radial-gradient(circle at 18% -8%, rgba(255,255,255,0.72), transparent 0 24%), radial-gradient(circle at 82% 0%, rgba(179, 103, 74, 0.08), transparent 0 22%), linear-gradient(180deg, #f5efe7 0%, #efe7dc 54%, #e5dccf 100%)"
            : "radial-gradient(circle at 18% -6%, rgba(255,255,255,0.1), transparent 0 24%), radial-gradient(circle at 82% 0%, rgba(198, 204, 214, 0.05), transparent 0 22%), linear-gradient(180deg, #151920 0%, #0a0c10 52%, #050608 100%)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: isLight
            ? "radial-gradient(circle at top, rgba(255,255,255,0.72), transparent 44%), linear-gradient(180deg, rgba(255,250,244,0.84), rgba(244,239,232,0.9))"
            : "radial-gradient(circle at top, rgba(255,255,255,0.055), transparent 42%), linear-gradient(180deg, rgba(30,34,41,0.8), rgba(14,16,21,0.92))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: `1px solid ${alpha(isLight ? "#6f5d4f" : "#f5f7fa", isLight ? 0.12 : 0.08)}`,
          boxShadow: isLight
            ? "0 22px 48px rgba(115, 96, 78, 0.12), inset 0 1px 0 rgba(255,255,255,0.82)"
            : "0 24px 56px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.1)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          minHeight: 36,
          paddingInline: 14,
          boxShadow: "none",
          "&.Mui-disabled": {
            color: alpha(ink, 0.4),
            borderColor: alpha(ink, 0.08),
            background: alpha(isLight ? "#6f5d4f" : "#ffffff", isLight ? 0.06 : 0.06),
          },
        },
        contained: {
          background: isLight
            ? "linear-gradient(180deg, rgba(191,115,84,0.98) 0%, rgba(164,87,61,0.98) 100%)"
            : "linear-gradient(180deg, rgba(248,249,251,0.98) 0%, rgba(220,224,230,0.98) 100%)",
          color: accentInk,
          "&:hover": {
            background: isLight
              ? "linear-gradient(180deg, rgba(199,124,91,1) 0%, rgba(170,91,64,1) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(228,231,236,1) 100%)",
            boxShadow: isLight
              ? "0 8px 18px rgba(128, 77, 52, 0.14)"
              : "0 8px 18px rgba(0, 0, 0, 0.18)",
          },
        },
        outlined: {
          borderColor: alpha(ink, isLight ? 0.12 : 0.1),
          background: alpha(isLight ? "#fffaf4" : "#ffffff", isLight ? 0.72 : 0.05),
          color: ink,
          "&:hover": {
            borderColor: alpha(ink, isLight ? 0.18 : 0.16),
            background: alpha(isLight ? "#fffaf4" : "#ffffff", isLight ? 0.9 : 0.08),
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          background: alpha(isLight ? "#fffaf4" : "#ffffff", isLight ? 0.72 : 0.06),
          border: `1px solid ${alpha(ink, isLight ? 0.1 : 0.1)}`,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          background: alpha(isLight ? "#fffaf4" : "#ffffff", isLight ? 0.72 : 0.06),
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          "& fieldset": {
            borderColor: alpha(ink, isLight ? 0.12 : 0.1),
          },
          "&:hover fieldset": {
            borderColor: alpha(ink, isLight ? 0.18 : 0.16),
          },
          "&.Mui-focused fieldset": {
            borderColor: alpha(accent, isLight ? 0.48 : 0.36),
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        size: "small",
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 28,
          background: isLight
            ? "radial-gradient(circle at top, rgba(255,255,255,0.78), transparent 38%), linear-gradient(180deg, rgba(255,250,244,0.96), rgba(244,239,232,0.98))"
            : "radial-gradient(circle at top, rgba(255,255,255,0.06), transparent 36%), linear-gradient(180deg, rgba(36,40,48,0.84), rgba(17,19,24,0.92))",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          border: `1px solid ${alpha(isLight ? "#6f5d4f" : "#f4efe7", isLight ? 0.14 : 0.1)}`,
          boxShadow: isLight
            ? "0 26px 70px rgba(112, 91, 68, 0.18)"
            : "0 26px 70px rgba(0, 0, 0, 0.42)",
        },
      },
    },
  },
  });
}

export const appTheme = createAppTheme("dark");
