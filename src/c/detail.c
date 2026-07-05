#include <pebble.h>
#include "detail.h"

// Provided by main.c — gives detail.c read-only access to the readings array
extern int         bp_get_count(void);
extern int         bp_get_systolic(int index);
extern int         bp_get_diastolic(int index);
extern int         bp_get_rhr(int index);
extern const char *bp_get_date(int index);
extern const char *bp_get_fulldate(int index);

static Window    *s_detail_window;
static TextLayer *s_values_layer;
static TextLayer *s_date_layer;
static TextLayer *s_rhr_layer;
static TextLayer *s_rhr_value_layer;

static char s_values_buf[24];
static char s_date_buf[48];
static char s_rhr_label_buf[24];
static char s_rhr_value_buf[16];

static int s_current_index = 0;

// --- Fill buffers and refresh layers for a given reading index ---

static void detail_load_index(int index) {
  int count = bp_get_count();
  if (index < 0) index = 0;
  if (index >= count) index = count - 1;
  s_current_index = index;

  // Update background colour on every navigation
#ifdef PBL_COLOR
  if (s_detail_window) {
    if (bp_get_systolic(index) > 146) {
      window_set_background_color(s_detail_window, GColorMelon);
    } else {
      window_set_background_color(s_detail_window, GColorWhite);
    }
  }
#endif

  snprintf(s_values_buf, sizeof(s_values_buf),
           "%d/%d", bp_get_systolic(index), bp_get_diastolic(index));

  const char *fd = bp_get_fulldate(index);
  if (fd && fd[0] != '\0') {
    strncpy(s_date_buf, fd, sizeof(s_date_buf) - 1);
    s_date_buf[sizeof(s_date_buf) - 1] = '\0';
  } else {
    s_date_buf[0] = '\0';
  }

  int rhr = bp_get_rhr(index);
  snprintf(s_rhr_label_buf, sizeof(s_rhr_label_buf), "Resting Heart Rate:");
  if (rhr > 0) {
    snprintf(s_rhr_value_buf, sizeof(s_rhr_value_buf), "%d bpm", rhr);
  } else {
    snprintf(s_rhr_value_buf, sizeof(s_rhr_value_buf), "-- bpm");
  }

  // Refresh layers if window is already on screen
  if (s_values_layer)    text_layer_set_text(s_values_layer,    s_values_buf);
  if (s_date_layer)      text_layer_set_text(s_date_layer,      s_date_buf);
  if (s_rhr_layer)       text_layer_set_text(s_rhr_layer,       s_rhr_label_buf);
  if (s_rhr_value_layer) text_layer_set_text(s_rhr_value_layer, s_rhr_value_buf);
}

// --- Click handlers ---

static void up_click_handler(ClickRecognizerRef recognizer, void *context) {
  detail_load_index(s_current_index - 1);
}

static void down_click_handler(ClickRecognizerRef recognizer, void *context) {
  detail_load_index(s_current_index + 1);
}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP,   up_click_handler);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_click_handler);
}

// --- Window setup ---

static void detail_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);

  // Systolic/diastolic — large, bold, fills width
  s_values_layer = text_layer_create(GRect(0, 12, b.size.w, 46));
  text_layer_set_text(s_values_layer, s_values_buf);
  text_layer_set_font(s_values_layer, fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD));
  text_layer_set_text_alignment(s_values_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_values_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_values_layer));

  // Date block — weekday / date / time, three lines, sent pre-formatted from JS
  s_date_layer = text_layer_create(GRect(0, 66, b.size.w, 72));
  text_layer_set_text(s_date_layer, s_date_buf);
  text_layer_set_font(s_date_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24));
  text_layer_set_text_alignment(s_date_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_date_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_date_layer));

  // RHR label
  s_rhr_layer = text_layer_create(GRect(0, 150, b.size.w, 24));
  text_layer_set_text(s_rhr_layer, s_rhr_label_buf);
  text_layer_set_font(s_rhr_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(s_rhr_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_rhr_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_rhr_layer));

  // RHR value — larger, on its own line
  s_rhr_value_layer = text_layer_create(GRect(0, 176, b.size.w, 40));
  text_layer_set_text(s_rhr_value_layer, s_rhr_value_buf);
  text_layer_set_font(s_rhr_value_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_text_alignment(s_rhr_value_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_rhr_value_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_rhr_value_layer));

  window_set_click_config_provider(window, click_config_provider);
}

static void detail_window_unload(Window *window) {
  text_layer_destroy(s_values_layer);
  text_layer_destroy(s_date_layer);
  text_layer_destroy(s_rhr_layer);
  text_layer_destroy(s_rhr_value_layer);
  s_values_layer    = NULL;
  s_date_layer      = NULL;
  s_rhr_layer       = NULL;
  s_rhr_value_layer = NULL;
  window_destroy(s_detail_window);
  s_detail_window   = NULL;
}

// --- Public entry point ---

void detail_window_show(int index, int systolic, int diastolic, int rhr, const char *fulldate) {
  s_detail_window = window_create();
  window_set_window_handlers(s_detail_window, (WindowHandlers){
    .load   = detail_window_load,
    .unload = detail_window_unload,
  });

  // Load index after window exists so background colour applies correctly
  detail_load_index(index);

  window_stack_push(s_detail_window, true);
}