package com.waaba.mobile

object WebAppConfig {
    const val BASE_URL = "https://waaba.invalid/"
    const val BRIDGE_NAME = "WaabaBridge"

    val WAABA_CSS = """
        @font-face { font-family: Font_iOS; src: url('/fonts/Font_iOS.ttf'); }
        @font-face { font-family: Font_iOS_Medium; src: url('/fonts/Font_iOS_Medium.ttf'); }
        @font-face { font-family: Font_iOS_SemiBold; src: url('/fonts/Font_iOS_SemiBold.ttf'); }
        @font-face { font-family: Font_iOS_Bold; src: url('/fonts/Font_iOS_Bold.ttf'); }
        :root {
          --primary: #28A156;
          --waaba-green: #28A156;
          --waaba-green-bright: #25D366;
          --waaba-surface: #F7F5F3;
          --waaba-bg: #EFEAE2;
          --waaba-text: #111B21;
          --waaba-muted: #667781;
          --waaba-divider: #CECECE;
          --waaba-incoming: #FFFFFF;
          --waaba-outgoing: #D9FDD3;
        }
        * { font-family: Font_iOS, -apple-system, BlinkMacSystemFont, sans-serif !important; }
        html, body, #root { background: var(--waaba-bg) !important; color: var(--waaba-text) !important; }
        header, [role="banner"], [class*="header"] { background: var(--waaba-surface) !important; color: var(--waaba-text) !important; }
        button, [role="button"], a[class*="button"] { border-radius: 10px !important; color: var(--waaba-green) !important; }
        [class*="rounded-full"], [class*="rounded-3xl"] { border-radius: 999px !important; }
        [class*="bg-primary"], [class*="bg-green-"], [class*="bg-emerald-"] { background-color: var(--waaba-green) !important; }
        [class*="text-primary"], [class*="text-green-"], [class*="text-emerald-"] { color: var(--waaba-green) !important; }
        input, textarea, select { background: #FFFFFF !important; color: var(--waaba-text) !important; border: 1px solid #D1D7DB !important; border-radius: 10px !important; }
        [role="dialog"], [class*="modal"], [class*="sheet"] { border-radius: 16px !important; background: var(--waaba-incoming) !important; }
        [class*="bubble"], [class*="message"] { border-radius: 9px !important; }
        nav[class*="justify-around"] { display: none !important; }
    """.trimIndent()
}
