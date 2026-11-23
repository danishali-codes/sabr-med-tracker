package com.danishalicodes.sabr.wear;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Today's doses as the phone last sent them (see src/wear/payload.ts in the phone app).
 * Kept in the watch app's private storage only.
 */
final class Today {
    static final class Mark {
        final String time;
        String state; // taken, skipped or open

        Mark(String time, String state) {
            this.time = time;
            this.state = state;
        }
    }

    static final class Group {
        final String time;
        final String label;
        final long at;
        final int count;
        @Nullable final String names;
        long snoozedUntil;

        Group(String time, String label, long at, int count, @Nullable String names, long snoozedUntil) {
            this.time = time;
            this.label = label;
            this.at = at;
            this.count = count;
            this.names = names;
            this.snoozedUntil = snoozedUntil;
        }

        boolean isDue(long now) {
            return at <= now && snoozedUntil <= now;
        }
    }

    /** One dose in today's full list (the watch app's screen). */
    static final class Item {
        final String time;
        final String label;
        @Nullable final String name;
        final String what;
        String state;
        @Nullable String at;

        Item(String time, String label, @Nullable String name, String what, String state, @Nullable String at) {
            this.time = time;
            this.label = label;
            this.name = name;
            this.what = what;
            this.state = state;
            this.at = at;
        }
    }

    private static final String PREFS = "sabr";
    private static final String KEY = "today";

    final String date;
    final long made;
    int done;
    final int total;
    final int streak;
    final List<Mark> marks = new ArrayList<>();
    final List<Group> open = new ArrayList<>();
    final List<Item> list = new ArrayList<>();

    private Today(JSONObject o) throws JSONException {
        date = o.getString("date");
        made = o.optLong("made");
        done = o.getInt("done");
        total = o.getInt("total");
        streak = o.optInt("streak");
        JSONArray m = o.getJSONArray("marks");
        for (int i = 0; i < m.length(); i++) {
            JSONObject x = m.getJSONObject(i);
            marks.add(new Mark(x.getString("t"), x.getString("s")));
        }
        JSONArray g = o.getJSONArray("open");
        for (int i = 0; i < g.length(); i++) {
            JSONObject x = g.getJSONObject(i);
            open.add(new Group(
                x.getString("time"),
                x.getString("label"),
                x.getLong("at"),
                x.getInt("count"),
                x.isNull("names") ? null : x.optString("names", null),
                x.isNull("snoozedUntil") ? 0 : x.optLong("snoozedUntil")));
        }
        // Older phone apps don't send the list.
        JSONArray l = o.optJSONArray("list");
        if (l != null) {
            for (int i = 0; i < l.length(); i++) {
                JSONObject x = l.getJSONObject(i);
                list.add(new Item(
                    x.getString("t"),
                    x.optString("label", x.getString("t")),
                    x.isNull("name") ? null : x.optString("name", null),
                    x.optString("what", ""),
                    x.optString("s", "open"),
                    x.isNull("at") ? null : x.optString("at", null)));
            }
        }
    }

    String toJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1).put("date", date).put("made", made).put("done", done).put("total", total).put("streak", streak);
            JSONArray m = new JSONArray();
            for (Mark x : marks) m.put(new JSONObject().put("t", x.time).put("s", x.state));
            o.put("marks", m);
            JSONArray g = new JSONArray();
            for (Group x : open) {
                g.put(new JSONObject()
                    .put("time", x.time).put("label", x.label).put("at", x.at).put("count", x.count)
                    .put("names", x.names == null ? JSONObject.NULL : x.names)
                    .put("snoozedUntil", x.snoozedUntil == 0 ? JSONObject.NULL : x.snoozedUntil));
            }
            o.put("open", g);
            JSONArray l = new JSONArray();
            for (Item x : list) {
                l.put(new JSONObject()
                    .put("t", x.time).put("label", x.label)
                    .put("name", x.name == null ? JSONObject.NULL : x.name)
                    .put("what", x.what).put("s", x.state)
                    .put("at", x.at == null ? JSONObject.NULL : x.at));
            }
            o.put("list", l);
            return o.toString();
        } catch (JSONException e) {
            return "";
        }
    }

    /** True when this is for today on the watch's clock. */
    boolean isToday() {
        return isTodayKey(date);
    }

    static boolean isTodayKey(String date) {
        return date.equals(new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()));
    }

    /** The earliest time that's due now and not snoozed, if any. */
    @Nullable
    Group due(long now) {
        for (Group g : open) if (g.isDue(now)) return g;
        return null;
    }

    /** The first time that isn't due yet (or is snoozed), if any. */
    @Nullable
    Group upcoming(long now) {
        for (Group g : open) if (!g.isDue(now)) return g;
        return null;
    }

    @Nullable
    Group find(String time) {
        for (Group g : open) if (g.time.equals(time)) return g;
        return null;
    }

    /** Shows a dose time as taken straight away; the phone confirms with fresh data. */
    void markTaken(Group g) {
        open.remove(g);
        int left = g.count;
        for (Mark m : marks) {
            if (left == 0) break;
            if (m.time.equals(g.time) && m.state.equals("open")) {
                m.state = "taken";
                left--;
                done++;
            }
        }
        for (Item x : list) {
            if (x.time.equals(g.time) && x.state.equals("open")) x.state = "taken";
        }
    }

    /** When the tile next needs redrawing without new data: a dose falling due or a snooze ending. */
    long nextChange(long now) {
        long next = Long.MAX_VALUE;
        for (Group g : open) {
            if (g.at > now) next = Math.min(next, g.at);
            if (g.snoozedUntil > now) next = Math.min(next, g.snoozedUntil);
        }
        return next;
    }

    @Nullable
    static Today load(Context context) {
        String json = prefs(context).getString(KEY, null);
        return json == null ? null : parse(json);
    }

    @Nullable
    static Today parse(String json) {
        try {
            return new Today(new JSONObject(json));
        } catch (JSONException e) {
            return null;
        }
    }

    static void save(Context context, String json) {
        prefs(context).edit().putString(KEY, json).apply();
    }

    static void clear(Context context) {
        prefs(context).edit().remove(KEY).apply();
    }

    // ---- Taken / Snooze presses the phone hasn't received yet ----

    static synchronized void addPending(Context context, String path, String date, String time) {
        Set<String> set = new HashSet<>(prefs(context).getStringSet("pending", new HashSet<>()));
        set.add(path + "\n" + date + "\n" + time);
        prefs(context).edit().putStringSet("pending", set).apply();
    }

    static synchronized void removePending(Context context, String path, String date, String time) {
        Set<String> set = new HashSet<>(prefs(context).getStringSet("pending", new HashSet<>()));
        set.remove(path + "\n" + date + "\n" + time);
        prefs(context).edit().putStringSet("pending", set).apply();
    }

    static synchronized List<String[]> pending(Context context) {
        List<String[]> out = new ArrayList<>();
        for (String s : prefs(context).getStringSet("pending", new HashSet<>())) {
            String[] p = s.split("\n");
            if (p.length == 3) out.add(p);
        }
        return out;
    }

    static boolean refreshAskedRecently(Context context, long now) {
        SharedPreferences p = prefs(context);
        if (now - p.getLong("askedAt", 0) < 10 * 60 * 1000) return true;
        p.edit().putLong("askedAt", now).apply();
        return false;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
