import { Slide, ToastContainer } from 'react-toastify';

export { toast } from 'react-toastify';

/**
 * Where `toast(…)` messages appear: bottom-right, auto-dismissed. Mounted once in the app shell,
 * above the routes, so a toast outlives the page that raised it. Colors come from the
 * `--toastify-*` overrides in global.css.
 */
export function Toaster() {
  return (
    <ToastContainer
      position="bottom-right"
      autoClose={4000}
      hideProgressBar
      closeOnClick
      transition={Slide}
    />
  );
}
