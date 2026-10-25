package org.exarhteam.iitc_mobile;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.exarhteam.iitc_mobile.IITC_NavigationHelper.Pane;
import org.exarhteam.iitc_mobile.car.PortalBridge;
import org.exarhteam.iitc_mobile.share.ShareActivity;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * JavaScript interface for communication between IITC script and Android app.
 * Provides access to native Android functionality from within the WebView.
 */
public class IITC_JSInterface {
    // context of main activity
    protected final IITC_Mobile mIitc;

    IITC_JSInterface(final IITC_Mobile iitc) {
        mIitc = iitc;
    }

    // open dialog to send geo intent for navigation apps like gmaps or waze etc...
    @JavascriptInterface
    public void intentPosLink(
            final double lat, final double lng, final int zoom, final String title, final boolean isPortal) {
        this.intentPosLink(lat, lng, zoom, title, isPortal, null);
    }

    @JavascriptInterface
    public void intentPosLink(
            final double lat, final double lng, final int zoom, final String title, final boolean isPortal, final String guid) {
        mIitc.startActivity(ShareActivity.forPosition(mIitc, lat, lng, zoom, title, isPortal, guid));
    }

    // share a string to the IITC share activity. only uses the share tab.
    @JavascriptInterface
    public void shareString(final String str) {
        mIitc.startActivity(ShareActivity.forString(mIitc, str));
    }

    // disable javascript injection while spinner is enabled
    // prevent the spinner from closing automatically
    @JavascriptInterface
    public void spinnerEnabled(final boolean en) {
        mIitc.getWebView().disableJS(en);
    }

    // copy link to specific portal to android clipboard
    @JavascriptInterface
    public void copy(final String s) {
        final ClipboardManager clipboard = (ClipboardManager) mIitc.getSystemService(Context.CLIPBOARD_SERVICE);
        final ClipData clip = ClipData.newPlainText("Copied Text ", s);
        clipboard.setPrimaryClip(clip);
        Toast.makeText(mIitc, "copied to clipboard", Toast.LENGTH_SHORT).show();
    }

    @JavascriptInterface
    public int getVersionCode() {
        int versionCode = 0;
        try {
            final PackageInfo pInfo = mIitc.getPackageManager().getPackageInfo(mIitc.getPackageName(), 0);
            versionCode = pInfo.versionCode;
        } catch (final PackageManager.NameNotFoundException e) {
            Log.w(e);
        }
        return versionCode;
    }

    @JavascriptInterface
    public String getVersionName() {
        String buildVersion = "unknown";
        final PackageManager pm = mIitc.getPackageManager();
        try {
            final PackageInfo info = pm.getPackageInfo(mIitc.getPackageName(), 0);
            buildVersion = info.versionName;
        } catch (final PackageManager.NameNotFoundException e) {
            Log.w(e);
        }
        return buildVersion;
    }

    @JavascriptInterface
    public void switchToPane(final String id) {
        mIitc.runOnUiThread(() -> {
            Pane pane;
            try {
                pane = mIitc.getNavigationHelper().getPane(id);
            } catch (final IllegalArgumentException e) {
                pane = Pane.MAP;
            }

            mIitc.setCurrentPane(pane);
        });
    }

    @JavascriptInterface
    public void dialogFocused(final String id) {
        mIitc.setFocusedDialog(id);
    }

    @JavascriptInterface
    public void dialogOpened(final String id, final boolean open) {
        mIitc.dialogOpened(id, open);
    }

    @JavascriptInterface
    public void bootFinished() {
        Log.d("...boot finished");

        mIitc.runOnUiThread(() -> {
            mIitc.setLoadingState(false);

            mIitc.getMapSettings().onBootFinished();
            injectAutoBridge();
        });
    }

    /**
     * Bridge Android Auto: sunting userscript dari asset setelah IITC selesai boot,
     * supaya nggak perlu install plugin manual dan versinya selalu sejalan dengan APK.
     */
    private void injectAutoBridge() {
        final String script = readAsset("iitc-auto-bridge.js");
        if (script == null) {
            Log.d("bridge: asset iitc-auto-bridge.js nggak ada, layar mobil nggak akan dapat data");
            return;
        }
        mIitc.getWebView().evaluateJavascript(script, null);
        Log.d("bridge: userscript Android Auto disuntik ke WebView");
    }

    private String readAsset(final String name) {
        try (InputStream is = mIitc.getAssets().open(name)) {
            final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            final byte[] chunk = new byte[8192];
            int read;
            while ((read = is.read(chunk)) > 0) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        } catch (Throwable t) {
            Log.w("bridge: gagal baca asset " + name + " -> " + t);
            return null;
        }
    }

    /**
     * Dipanggil userscript bridge: app.sendPortals(json).
     * Data cuma diterima kalau datang dari halaman intel map dan payload-nya valid.
     */
    @JavascriptInterface
    public void sendPortals(final String json) {
        final IITC_WebView webView = mIitc.getWebView();
        final String url = webView != null ? webView.getUrl() : null;
        final boolean accepted = PortalBridge.INSTANCE.accept(json, url);
        if (!accepted) {
            Log.d("bridge: payload portal ditolak -> " + PortalBridge.INSTANCE.getLastRejection().getValue());
        }
    }

    // get layers and list them in a dialog
    @JavascriptInterface
    public void setLayers(final String base_layer, final String overlay_layer) {
        mIitc.runOnUiThread(() -> mIitc.getMapSettings().setLayers(base_layer, overlay_layer));
    }

    @JavascriptInterface
    public void addPortalHighlighter(final String name) {
        mIitc.runOnUiThread(() -> mIitc.getMapSettings().addPortalHighlighter(name));
    }

    @JavascriptInterface
    public void setActiveHighlighter(final String name) {
        mIitc.runOnUiThread(() -> mIitc.getMapSettings().setActiveHighlighter(name));
    }

    @JavascriptInterface
    public void addPane(final String name, final String label, final String icon) {
        mIitc.runOnUiThread(() -> mIitc.getNavigationHelper().addPane(name, label, icon));
    }

    // some plugins may have no specific icons...add a default icon
    @JavascriptInterface
    public void addPane(final String name, final String label) {
        mIitc.runOnUiThread(() -> mIitc.getNavigationHelper().addPane(name, label, IITC_IconDrawable.DEFAULT_LIGATURE));
    }

    @JavascriptInterface
    public boolean showZoom() {
        final PackageManager pm = mIitc.getPackageManager();
        final boolean hasMultitouch = pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN_MULTITOUCH);
        final boolean forcedZoom = mIitc.getPrefs().getBoolean("pref_user_zoom", false);
        return forcedZoom || !hasMultitouch;
    }

    @JavascriptInterface
    public void setFollowMode(final boolean follow) {
        mIitc.runOnUiThread(() -> mIitc.getUserLocation().setFollowMode(follow));
    }

    @JavascriptInterface
    public void setProgress(final double progress) {
        mIitc.runOnUiThread(() -> {
            try {
                if (progress != -1) {
                    // maximum for setProgress is 10,000
                    mIitc.setProgressBarIndeterminate(false);
                    mIitc.setProgress((int) Math.round(progress * 10000));
                }
                else {
                    mIitc.setProgressBarIndeterminate(true);
                    mIitc.setProgress(1);
                }
            } catch(NullPointerException e) {
                // for some reason, setProgressBarIndeterminate throws a NullPointerException on some devices
                e.printStackTrace();
                mIitc.setProgress(10000); // hide the progress bar
            }
        });
    }

    @JavascriptInterface
    public String getFileRequestUrlPrefix() {
        return mIitc.getFileManager().getFileRequestPrefix();
    }

    @JavascriptInterface
    public void setPermalink(final String href) {
        mIitc.setPermalink(href);
    }

    @JavascriptInterface
    public void saveFile(final String filename, final String type, final String content) {
        mIitc.runOnUiThread(() -> {
            IITC_FileManager.FileSaveRequest saveRequest =
                    mIitc.getFileManager().new FileSaveRequest(filename, type, content);
        });
    }

    @JavascriptInterface
    public void reloadIITC() {
        mIitc.runOnUiThread(mIitc::reloadIITC);
    }

    @JavascriptInterface
    public void reloadIITC(final boolean clearCache) {
        mIitc.runOnUiThread(() -> {
            if (clearCache) mIitc.getWebView().clearCache(true);
            mIitc.reloadIITC();
        });
    }

    @JavascriptInterface
    public void addInternalHostname(String hostname) {
        mIitc.addInternalHostname(hostname);
    }
}
