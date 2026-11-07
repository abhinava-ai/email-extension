// Crawlers and link-preview bots that identify themselves. Names are matched on their own,
// not as "bot" anywhere, so a phone or browser with "bot" inside a longer word is never refused.
const CRAWLER_NAMES = [
  // Search engines
  "Googlebot", "GoogleOther", "Google-InspectionTool", "Storebot-Google", "AdsBot-Google", "Mediapartners-Google",
  "bingbot", "BingPreview", "msnbot", "AdIdxBot", "Slurp", "DuckDuckBot", "DuckAssistBot", "Baiduspider", "YandexBot", "YandexImages",
  "Sogou", "Exabot", "SeznamBot", "Qwantify", "PetalBot", "Applebot", "Applebot-Extended",
  // AI crawlers and assistants
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "Claude-Web", "anthropic-ai",
  "PerplexityBot", "Perplexity-User", "CCBot", "Bytespider", "Amazonbot", "cohere-ai", "cohere-training-data-crawler",
  "Diffbot", "YouBot", "MistralAI-User", "Meta-ExternalAgent", "Meta-ExternalFetcher", "FacebookBot", "Timpibot", "ImagesiftBot",
  "omgili", "omgilibot", "Webzio-Extended", "AI2Bot", "PanguBot", "DeepSeekBot", "Kangaroo Bot",
  // Link previews in social and chat apps
  "facebookexternalhit", "Twitterbot", "LinkedInBot", "Slackbot", "Slackbot-LinkExpanding", "Discordbot", "WhatsApp", "TelegramBot", "Pinterestbot", "redditbot",
  // SEO tools and archives
  "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot", "serpstatbot", "ia_archiver", "archive.org_bot",
];

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERN = new RegExp(`(?:^|[^a-z0-9])(?:${CRAWLER_NAMES.map(escape).join("|")})(?:$|[^a-z0-9])|\\b(?:crawler|spider)\\b`, "i");

export function isCrawler(userAgent: string | null) {
  return Boolean(userAgent && PATTERN.test(userAgent));
}
