// TypeScript 5.9's DOM library lacks these standard URLPattern names used by
// Next.js 16.3. URLPatternInit is already supplied by the installed Node types.
// Remove this bridge when the supported TypeScript DOM library includes them.
// https://urlpattern.spec.whatwg.org/#typedefdef-urlpatterninput
// https://urlpattern.spec.whatwg.org/#dictdef-urlpatternoptions
export {};

declare global {
  type URLPatternInput = string | URLPatternInit;

  interface URLPatternOptions {
    ignoreCase?: boolean;
  }
}
