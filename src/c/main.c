#include <pebble.h>
#include "detail.h"

// Message keys — must match index.js
#define KEY_INDEX     0
#define KEY_SYSTOLIC  1
#define KEY_DIASTOLIC 2
#define KEY_DATE      3
#define KEY_TOTAL     4
#define KEY_FULLDATE  5
#define KEY_RHR       6

#define MAX_READINGS  10
#define CELL_HEIGHT   64

typedef struct {
  int  systolic;
  int  diastolic;
  int  rhr;
  char date[20];
  char fulldate[48];
} BPReading;

static Window         *s_window;
static MenuLayer       *s_menu_layer;
static TextLayer       *s_status_layer;
static ActionBarLayer  *s_action_bar;

static GBitmap *s_icon_up;
static GBitmap *s_icon_down;
static GBitmap *s_icon_info;

static BPReading s_readings[MAX_READINGS];
static int s_reading_count = 0;
static int s_selected_row = 0;

// --- Row callbacks ---

static uint16_t menu_num_rows(MenuLayer *ml, uint16_t section, void *ctx) {
  return s_reading_count > 0 ? s_reading_count : 1;
}

static int16_t menu_cell_height(MenuLayer *ml, MenuIndex *idx, void *ctx) {
  return CELL_HEIGHT;
}

static void menu_draw_row(GContext *ctx, const Layer *cell,
                          MenuIndex *idx, void *context) {
  GRect bounds = layer_get_bounds(cell);

  if (s_reading_count == 0) {
    menu_cell_basic_draw(ctx, cell, "Waiting for data", "Open settings first", NULL);
    return;
  }

  BPReading *r = &s_readings[idx->row];
  bool highlighted = menu_cell_layer_is_highlighted(cell);

#ifdef PBL_COLOR
  if (!highlighted && r->systolic > 146) {
    graphics_context_set_fill_color(ctx, GColorMelon);
    graphics_fill_rect(ctx, bounds, 0, GCornerNone);
  }
#endif

  GColor text_color = highlighted ? GColorWhite : GColorBlack;
  graphics_context_set_text_color(ctx, text_color);

  char val[24];
  snprintf(val, sizeof(val), "%d / %d mmHg", r->systolic, r->diastolic);
  graphics_draw_text(ctx, val,
    fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD),
    GRect(6, 2, bounds.size.w - 12, 34),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

  if (r->systolic > 146) {
    graphics_draw_text(ctx, "!",
      fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD),
      GRect(6, 2, bounds.size.w - 12, 34),
      GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
  }

  graphics_draw_text(ctx, r->date,
    fonts_get_system_font(FONT_KEY_GOTHIC_24),
    GRect(6, 36, bounds.size.w - 12, 26),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);

  GColor sep_color = highlighted ? GColorWhite : GColorLightGray;
#ifdef PBL_COLOR
  graphics_context_set_stroke_color(ctx, sep_color);
#else
  graphics_context_set_stroke_color(ctx, GColorBlack);
#endif
  graphics_draw_line(ctx,
    GPoint(0, bounds.size.h - 1),
    GPoint(bounds.size.w, bounds.size.h - 1));
}

// --- Selection tracking + click handler ---

static void menu_selection_changed(MenuLayer *ml, MenuIndex new_index,
                                   MenuIndex old_index, void *ctx) {
  s_selected_row = new_index.row;
}

static void menu_select_click(MenuLayer *ml, MenuIndex *cell_index, void *ctx) {
  if (s_reading_count == 0) return;
  BPReading *r = &s_readings[cell_index->row];
  detail_window_show(r->systolic, r->diastolic, r->rhr, r->fulldate);
}

// --- AppMessage: receive data from phone ---

static void inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *total_t = dict_find(iter, KEY_TOTAL);
  if (total_t) {
    s_reading_count = 0;
    layer_set_hidden(text_layer_get_layer(s_status_layer), false);
    text_layer_set_text(s_status_layer, "Receiving...");
  }

  Tuple *idx_t      = dict_find(iter, KEY_INDEX);
  Tuple *sys_t      = dict_find(iter, KEY_SYSTOLIC);
  Tuple *dia_t      = dict_find(iter, KEY_DIASTOLIC);
  Tuple *date_t     = dict_find(iter, KEY_DATE);
  Tuple *fulldate_t = dict_find(iter, KEY_FULLDATE);
  Tuple *rhr_t      = dict_find(iter, KEY_RHR);

  if (idx_t && sys_t && dia_t && date_t) {
    int i = (int)idx_t->value->int32;
    if (i >= 0 && i < MAX_READINGS) {
      s_readings[i].systolic  = (int)sys_t->value->int32;
      s_readings[i].diastolic = (int)dia_t->value->int32;
      s_readings[i].rhr       = rhr_t ? (int)rhr_t->value->int32 : 0;
      strncpy(s_readings[i].date, date_t->value->cstring,
              sizeof(s_readings[i].date) - 1);
      if (fulldate_t) {
        strncpy(s_readings[i].fulldate, fulldate_t->value->cstring,
                sizeof(s_readings[i].fulldate) - 1);
      } else {
        s_readings[i].fulldate[0] = '\0';
      }
      if (i + 1 > s_reading_count) s_reading_count = i + 1;
      layer_set_hidden(text_layer_get_layer(s_status_layer), true);
      menu_layer_reload_data(s_menu_layer);
    }
  }
}

// --- Window setup ---

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
  GRect menu_bounds = GRect(0, 0, b.size.w - ACTION_BAR_WIDTH, b.size.h);

  s_status_layer = text_layer_create(
    GRect(0, b.size.h / 2 - 20, menu_bounds.size.w, 40));
  text_layer_set_text(s_status_layer, "Opening settings\nto load data");
  text_layer_set_text_alignment(s_status_layer, GTextAlignmentCenter);
  text_layer_set_font(s_status_layer,
    fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  layer_add_child(root, text_layer_get_layer(s_status_layer));

  s_menu_layer = menu_layer_create(menu_bounds);
  menu_layer_set_highlight_colors(s_menu_layer, GColorBlack, GColorWhite);
  menu_layer_set_callbacks(s_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows        = menu_num_rows,
    .draw_row             = menu_draw_row,
    .get_cell_height       = menu_cell_height,
    .selection_changed     = menu_selection_changed,
    .select_click          = menu_select_click,
  });
  menu_layer_set_click_config_onto_window(s_menu_layer, window);
  layer_add_child(root, menu_layer_get_layer(s_menu_layer));

  // Action bar with up / down / info icons
  s_icon_up   = gbitmap_create_with_resource(RESOURCE_ID_ACTION_ICON_UP);
  s_icon_down = gbitmap_create_with_resource(RESOURCE_ID_ACTION_ICON_DOWN);
  s_icon_info = gbitmap_create_with_resource(RESOURCE_ID_ACTION_ICON_INFO);

  s_action_bar = action_bar_layer_create();
  action_bar_layer_set_background_color(s_action_bar, GColorLightGray);
  action_bar_layer_set_icon(s_action_bar, BUTTON_ID_UP, s_icon_up);
  action_bar_layer_set_icon(s_action_bar, BUTTON_ID_DOWN, s_icon_down);
  action_bar_layer_set_icon(s_action_bar, BUTTON_ID_SELECT, s_icon_info);
  action_bar_layer_set_click_config_provider(s_action_bar, NULL);
  action_bar_layer_add_to_window(s_action_bar, window);

  // Action bar's own up/down/select clicks should still drive the menu
  menu_layer_set_click_config_onto_window(s_menu_layer, window);
}

static void window_unload(Window *window) {
  menu_layer_destroy(s_menu_layer);
  text_layer_destroy(s_status_layer);
  action_bar_layer_destroy(s_action_bar);
  gbitmap_destroy(s_icon_up);
  gbitmap_destroy(s_icon_down);
  gbitmap_destroy(s_icon_info);
}

// --- App entry point ---

static void init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){
    .load   = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);
  app_message_register_inbox_received(inbox_received);
  app_message_open(512, 64);
}

static void deinit(void) {
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}