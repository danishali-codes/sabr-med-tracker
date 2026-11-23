package com.danishalicodes.sabr.wear;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Today's full list: every dose by time, with what's taken, skipped or still to take. Opened by
 * tapping the tile, or from the watch's app list. A time that's due has a Taken button.
 */
public class MainActivity extends Activity implements SharedPreferences.OnSharedPreferenceChangeListener {
    private LinearLayout col;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        // Round screens: keep the first and last lines away from the curved edge.
        col.setPadding(dp(22), dp(30), dp(22), dp(44));
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.BLACK);
        scroll.addView(col);
        setContentView(scroll);
        scroll.requestFocus(); // the crown scrolls the list
    }

    @Override
    protected void onResume() {
        super.onResume();
        getSharedPreferences("sabr", MODE_PRIVATE).registerOnSharedPreferenceChangeListener(this);
        PhoneLink.pull(this);
        PhoneLink.askForRefresh(this);
        PhoneLink.flushPending(this);
        render();
    }

    @Override
    protected void onPause() {
        super.onPause();
        getSharedPreferences("sabr", MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(this);
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
        if ("today".equals(key)) runOnUiThread(this::render);
    }

    private void render() {
        col.removeAllViews();
        Today today = Today.load(this);
        if (today == null || !today.isToday()) {
            col.addView(label("Sabr", 20, Color.WHITE, true, Gravity.CENTER));
            col.addView(label(today == null ? "Waiting for your phone" : "Open Sabr on your phone to update", 15, TileLayout.PRIMARY, true, Gravity.CENTER));
            col.addView(label(
                "To add the tile, swipe left from the watch face, scroll to the end, tap Add tiles and pick Sabr.\n\n"
                    + "Today's doses come from the Sabr app on your phone. Turn on Watch tile in its settings.",
                13, TileLayout.FAINT, false, Gravity.CENTER));
            return;
        }
        col.addView(label("Today", 18, Color.WHITE, true, Gravity.CENTER));
        col.addView(label(today.total == 0 ? "Nothing due today" : today.done + " of " + today.total + " done", 13, TileLayout.FAINT, false, Gravity.CENTER));
        if (today.total == 0) return;
        if (today.list.isEmpty()) {
            col.addView(label("Update Sabr on your phone to see the full list here.", 13, TileLayout.FAINT, false, Gravity.CENTER));
            return;
        }
        long now = System.currentTimeMillis();
        String lastTime = null;
        int n = 0;
        for (Today.Item item : today.list) {
            if (!item.time.equals(lastTime)) {
                lastTime = item.time;
                n = 0;
                Today.Group g = today.find(item.time);
                col.addView(timeHeader(item.label, g != null && g.isDue(now) ? g : null, today));
            }
            n++;
            col.addView(row(item, n));
        }
    }

    private View timeHeader(String label, Today.Group due, Today today) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(12), 0, dp(2));
        TextView t = label(label, 14, TileLayout.PRIMARY, true, Gravity.START);
        row.addView(t, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        if (due != null) {
            TextView b = label("Taken", 13, TileLayout.ON_PRIMARY, true, Gravity.CENTER);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(TileLayout.PRIMARY);
            bg.setCornerRadius(dp(16));
            b.setBackground(bg);
            b.setPadding(dp(14), dp(6), dp(14), dp(6));
            b.setOnClickListener(v -> {
                today.markTaken(due);
                Today.save(this, today.toJson());
                PhoneLink.sendAction(this, "/sabr/take", today.date, due.time);
                PhoneLink.redraw(this);
                render();
            });
            row.addView(b);
        }
        return row;
    }

    private View row(Today.Item item, int n) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, dp(4), 0, dp(4));
        String title = item.name != null ? item.name : ("Medicine " + n + (item.what.isEmpty() ? "" : " · " + item.what));
        if (item.name != null && !item.what.isEmpty()) title = item.name + " · " + item.what;
        boolean taken = item.state.equals("taken");
        boolean skipped = item.state.equals("skipped");
        TextView name = label(title, 15, skipped ? TileLayout.SKIPPED : Color.WHITE, true, Gravity.START);
        row.addView(name);
        String status = taken ? (item.at != null ? "Taken at " + item.at : "Taken") : skipped ? "Skipped" : "To take";
        row.addView(label(status, 12, taken ? TileLayout.GOOD : TileLayout.FAINT, false, Gravity.START));
        return row;
    }

    private TextView label(String text, float sp, int color, boolean bold, int gravity) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextColor(color);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        v.setGravity(gravity);
        if (bold) v.setTypeface(v.getTypeface(), Typeface.BOLD);
        v.setPadding(0, dp(2), 0, dp(2));
        return v;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
