package com.danishalicodes.sabr.wear;

import static androidx.wear.protolayout.ColorBuilders.argb;
import static androidx.wear.protolayout.DimensionBuilders.degrees;
import static androidx.wear.protolayout.DimensionBuilders.dp;
import static androidx.wear.protolayout.DimensionBuilders.expand;
import static androidx.wear.protolayout.DimensionBuilders.sp;

import androidx.annotation.Nullable;
import androidx.wear.protolayout.ActionBuilders;
import androidx.wear.protolayout.LayoutElementBuilders;
import androidx.wear.protolayout.LayoutElementBuilders.Arc;
import androidx.wear.protolayout.LayoutElementBuilders.ArcLine;
import androidx.wear.protolayout.LayoutElementBuilders.ArcSpacer;
import androidx.wear.protolayout.LayoutElementBuilders.Box;
import androidx.wear.protolayout.LayoutElementBuilders.Column;
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle;
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement;
import androidx.wear.protolayout.LayoutElementBuilders.Row;
import androidx.wear.protolayout.LayoutElementBuilders.Spacer;
import androidx.wear.protolayout.LayoutElementBuilders.Text;
import androidx.wear.protolayout.ModifiersBuilders;

/**
 * Draws the tile: a ring around the edge with one segment per dose today, and in the middle
 * either the dose that's due (with Taken and Snooze), the next time, or the finished day.
 * When every dose is answered the ring turns green.
 */
final class TileLayout {
    // Sabr's dark palette (src/theme.ts in the phone app). Tiles always sit on black.
    static final int PRIMARY = 0xFF9B85FF;
    static final int GOOD = 0xFF3DD9A0;
    static final int TRACK = 0xFF2B2640;
    static final int SKIPPED = 0xFF5C5677;
    static final int BAD = 0xFFFF6B85;
    static final int TEXT = 0xFFFFFFFF;
    static final int FAINT = 0xFFB9B3CF;
    static final int ON_PRIMARY = 0xFF140F2B;

    static final String CLICK_TAKE = "take:";
    static final String CLICK_SNOOZE = "snooze:";
    static final String CLICK_OPEN = "open";

    private TileLayout() {}

    static LayoutElement build(@Nullable Today today, long now, String packageName) {
        if (today == null) {
            return screen(ring(null), message("Sabr", "Turn on Watch tile in Sabr's settings on your phone", packageName));
        }
        if (!today.isToday()) {
            return screen(ring(null), message("Sabr", "Open Sabr on your phone to update today", packageName));
        }
        if (today.total == 0) {
            return screen(ring(null), message("Nothing today", today.streak > 0 ? streak(today.streak) : "No doses are due today", packageName));
        }
        // Tapping the tile (anywhere but its buttons) opens today's full list.
        Today.Group due = today.due(now);
        if (due != null) return openList(screen(ring(today), dueNow(today, due)), packageName);
        if (today.open.isEmpty()) return openList(screen(ring(today), allDone(today)), packageName);
        return openList(screen(ring(today), upcoming(today, today.upcoming(now))), packageName);
    }

    // ---- the middle ----

    private static LayoutElement dueNow(Today today, Today.Group g) {
        String what = g.names != null ? g.names : (g.count == 1 ? "1 dose" : g.count + " doses");
        return new Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(text("Due " + g.label, 13, FAINT, false))
            .addContent(gap(2))
            .addContent(text(what, 20, TEXT, true))
            .addContent(gap(10))
            .addContent(new Row.Builder()
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .addContent(button("Taken", PRIMARY, ON_PRIMARY, CLICK_TAKE + today.date + "|" + g.time, 76))
                .addContent(new Spacer.Builder().setWidth(dp(6)).build())
                .addContent(button("Snooze", TRACK, TEXT, CLICK_SNOOZE + today.date + "|" + g.time, 70))
                .build())
            .addContent(gap(8))
            .addContent(text(today.done + " of " + today.total + " taken", 12, FAINT, false))
            .build();
    }

    private static LayoutElement upcoming(Today today, @Nullable Today.Group next) {
        Column.Builder c = new Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(text(today.done + "/" + today.total, 34, TEXT, true))
            .addContent(text("taken today", 12, FAINT, false));
        if (next != null) {
            c.addContent(gap(10));
            c.addContent(text(next.snoozedUntil > 0 ? "Snoozed" : "Next", 12, FAINT, false));
            c.addContent(text(next.names != null ? next.label + "  " + next.names : next.label, 15, PRIMARY, true));
        }
        c.addContent(gap(6));
        c.addContent(text("Tap for today's list", 11, FAINT, false));
        return c.build();
    }

    private static LayoutElement allDone(Today today) {
        Column.Builder c = new Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(text("All done", 24, GOOD, true))
            .addContent(gap(2))
            .addContent(text(today.done == 1 ? "1 dose today" : today.done + " doses today", 13, FAINT, false));
        if (today.streak > 0) {
            c.addContent(gap(10));
            c.addContent(text(streak(today.streak), 15, TEXT, true));
        }
        return c.build();
    }

    /** Opens the watch app (today's list) when tapped. */
    private static ModifiersBuilders.Clickable launch(String packageName) {
        return new ModifiersBuilders.Clickable.Builder()
            .setId(CLICK_OPEN)
            .setOnClick(new ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(new ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(packageName)
                    .setClassName(MainActivity.class.getName())
                    .build())
                .build())
            .build();
    }

    private static LayoutElement openList(LayoutElement content, String packageName) {
        return new Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setModifiers(new ModifiersBuilders.Modifiers.Builder().setClickable(launch(packageName)).build())
            .addContent(content)
            .build();
    }

    private static LayoutElement message(String title, String body, String packageName) {
        return new Box.Builder()
            .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                .setClickable(launch(packageName))
                .build())
            .addContent(new Column.Builder()
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .addContent(text(title, 18, TEXT, true))
                .addContent(gap(6))
                .addContent(new Text.Builder()
                    .setText(body)
                    .setMaxLines(3)
                    .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
                    .setFontStyle(font(13, FAINT, false))
                    .build())
                .build())
            .build();
    }

    private static String streak(int days) {
        return days == 1 ? "1 day streak" : days + " day streak";
    }

    // ---- the ring ----

    /** One segment per dose (a smooth ring past 16 doses). Green once everything is answered. */
    private static LayoutElement ring(@Nullable Today today) {
        Arc.Builder arc = new Arc.Builder()
            .setAnchorAngle(degrees(0))
            .setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START);
        float thickness = 7;
        if (today == null || today.total == 0) {
            arc.addContent(line(360, TRACK, thickness));
            return arcBox(arc);
        }
        boolean finished = today.open.isEmpty();
        int n = today.marks.size();
        if (n > 16) {
            float part = 360f * today.done / Math.max(1, today.total);
            if (part > 0) arc.addContent(line(part, finished ? GOOD : PRIMARY, thickness));
            if (part < 360) arc.addContent(line(360 - part, TRACK, thickness));
            return arcBox(arc);
        }
        // Round caps reach past each segment's end, so the gaps are a little wider than they look.
        float gapDeg = n == 1 ? 0 : 9;
        float seg = (360f - gapDeg * n) / n;
        for (Today.Mark m : today.marks) {
            int color;
            if (m.state.equals("missed")) color = BAD;
            else if (finished) color = m.state.equals("skipped") ? SKIPPED : GOOD;
            else if (m.state.equals("taken")) color = PRIMARY;
            else if (m.state.equals("skipped")) color = SKIPPED;
            else color = TRACK;
            arc.addContent(line(seg, color, thickness));
            if (gapDeg > 0) arc.addContent(new ArcSpacer.Builder().setLength(degrees(gapDeg)).build());
        }
        return arcBox(arc);
    }

    private static ArcLine line(float lengthDeg, int color, float thickness) {
        return new ArcLine.Builder()
            .setLength(degrees(lengthDeg))
            .setThickness(dp(thickness))
            .setColor(argb(color))
            .build();
    }

    private static LayoutElement arcBox(Arc.Builder arc) {
        return new Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setModifiers(new ModifiersBuilders.Modifiers.Builder().setPadding(padding(5, 5)).build())
            .addContent(arc.build())
            .build();
    }

    // ---- pieces ----

    private static LayoutElement screen(LayoutElement ring, LayoutElement middle) {
        return new Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(ring)
            .addContent(new Box.Builder()
                .setWidth(expand())
                .setHeight(expand())
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .setModifiers(new ModifiersBuilders.Modifiers.Builder().setPadding(padding(26, 20)).build())
                .addContent(middle)
                .build())
            .build();
    }

    private static LayoutElement button(String label, int bg, int fg, String id, float width) {
        return new Box.Builder()
            .setWidth(dp(width))
            .setHeight(dp(40))
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                .setBackground(new ModifiersBuilders.Background.Builder()
                    .setColor(argb(bg))
                    .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(dp(20)).build())
                    .build())
                .setClickable(new ModifiersBuilders.Clickable.Builder()
                    .setId(id)
                    .setOnClick(new ActionBuilders.LoadAction.Builder().build())
                    .build())
                .build())
            .addContent(text(label, 14, fg, true))
            .build();
    }

    private static Text text(String s, float size, int color, boolean bold) {
        return new Text.Builder()
            .setText(s)
            .setMaxLines(1)
            .setFontStyle(font(size, color, bold))
            .build();
    }

    private static FontStyle font(float size, int color, boolean bold) {
        return new FontStyle.Builder()
            .setSize(sp(size))
            .setColor(argb(color))
            .setWeight(bold ? LayoutElementBuilders.FONT_WEIGHT_BOLD : LayoutElementBuilders.FONT_WEIGHT_NORMAL)
            .build();
    }

    private static LayoutElement gap(float height) {
        return new Spacer.Builder().setHeight(dp(height)).build();
    }

    private static ModifiersBuilders.Padding padding(float horizontal, float vertical) {
        return new ModifiersBuilders.Padding.Builder()
            .setStart(dp(horizontal))
            .setEnd(dp(horizontal))
            .setTop(dp(vertical))
            .setBottom(dp(vertical))
            .build();
    }
}
