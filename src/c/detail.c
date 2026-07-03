#include <pebble.h>
#include "detail.h"

static Window    *s_detail_window;
static TextLayer  *s_values_layer;
static TextLayer  *s_date_layer;
static TextLayer  *s_rhr_layer;

static char s_values_buf[24];
static char s_date_buf[48];
static char s_rhr_buf[40];

static void detail_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);

  // Systolic/diastolic — large, bold, fills width
  s_values_layer = text_layer_create(GRect(0, 12, b.size.w, 46));
  text_layer_set_text(s_values_layer, s_values_buf);
  text_layer_set_font(s_values_layer, fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD));
  text_layer_set_text_alignment(s_values_layer, GTextAlignmentCenter);
  layer_add_child(root, text_layer_get_layer(s_values_layer));

  // Date block — weekday / date / time, three lines, sent pre-formatted from JS
  s_date_layer = text_layer_create(GRect(0, 66, b.size.w, 72));
  text_layer_set_text(s_date_layer, s_date_buf);
  text_layer_set_font(s_date_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24));
  text_layer_set_text_alignment(s_date_layer, GTextAlignmentCenter);
  layer_add_child(root, text_layer_get_layer(s_date_layer));

  // Resting heart rate — with slight spacing below the date block
  s_rhr_layer = text_layer_create(GRect(0, 150, b.size.w, 30));
  text_layer_set_text(s_rhr_layer, s_rhr_buf);
  text_layer_set_font(s_rhr_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(s_rhr_layer, GTextAlignmentCenter);
  layer_add_child(root, text_layer_get_layer(s_rhr_layer));
}

static void detail_window_unload(Window *window) {
  text_layer_destroy(s_values_layer);
  text_layer_destroy(s_date_layer);
  text_layer_destroy(s_rhr_layer);
  window_destroy(s_detail_window);
  s_detail_window = NULL;
}

void detail_window_show(int systolic, int diastolic, int rhr, const char *fulldate) {
  snprintf(s_values_buf, sizeof(s_values_buf), "%d/%d", systolic, diastolic);

  if (fulldate && fulldate[0] != '\0') {
    strncpy(s_date_buf, fulldate, sizeof(s_date_buf) - 1);
    s_date_buf[sizeof(s_date_buf) - 1] = '\0';
  } else {
    s_date_buf[0] = '\0';
  }

  if (rhr > 0) {
    snprintf(s_rhr_buf, sizeof(s_rhr_buf), "Resting Heart Rate: %d bpm", rhr);
  } else {
    snprintf(s_rhr_buf, sizeof(s_rhr_buf), "Resting Heart Rate: -- bpm");
  }

  s_detail_window = window_create();
  window_set_window_handlers(s_detail_window, (WindowHandlers){
    .load   = detail_window_load,
    .unload = detail_window_unload,
  });
  window_stack_push(s_detail_window, true);
}

