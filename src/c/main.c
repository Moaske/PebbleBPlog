#include <pebble.h>

// Message keys — must match index.js
#define KEY_INDEX     0
#define KEY_SYSTOLIC  1
#define KEY_DIASTOLIC 2
#define KEY_DATE      3
#define KEY_TOTAL     4

#define MAX_READINGS  10
#define HEADER_HEIGHT 28
#define CELL_HEIGHT   64

typedef struct {
  int  systolic;
  int  diastolic;
  char date[20];
} BPReading;

static Window    *s_window;
static MenuLayer *s_menu_layer;
static TextLayer *s_status_layer;

static BPReading s_readings[MAX_READINGS];
static int s_reading_count = 0;

// --- Header callbacks ---

static uint16_t menu_num_sections(MenuLayer *ml, void *ctx) {
  return 1;
}

static int16_t menu_header_height(MenuLayer *ml, uint16_t section, void *ctx) {
  return HEADER_HEIGHT;
}

static void menu_draw_header(GContext *ctx, const Layer *cell,
                             uint16_t section, void *context) {
  GRect bounds = layer_get_bounds(cell);

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorLightGray);
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);

  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, "BP Diary",
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(0, 2, bounds.size.w, 24),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
}

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

  // Check if this row is currently selected/highlighted
  bool highlighted = menu_cell_layer_is_highlighted(cell);

  // When not highlighted, show melon background for high systolic readings
#ifdef PBL_COLOR
  if (!highlighted && r->systolic > 150) {
    graphics_context_set_fill_color(ctx, GColorMelon);
    graphics_fill_rect(ctx, bounds, 0, GCornerNone);
  }
#endif

  // Use white text on highlighted (black) rows, black text otherwise
  GColor text_color = highlighted ? GColorWhite : GColorBlack;
  graphics_context_set_text_color(ctx, text_color);

  // Values — bold, large, left-aligned
  char val[24];
  snprintf(val, sizeof(val), "%d / %d mmHg", r->systolic, r->diastolic);
  graphics_draw_text(ctx, val,
    fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD),
    GRect(6, 2, bounds.size.w - 12, 34),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

  // Exclamation mark when systolic > 150 — bold, right-aligned, same row
  if (r->systolic > 150) {
    graphics_draw_text(ctx, "!",
      fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD),
      GRect(6, 2, bounds.size.w - 12, 34),
      GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
  }

  // Date — regular weight, GOTHIC_24 (~120% of GOTHIC_18), right-aligned
  graphics_draw_text(ctx, r->date,
    fonts_get_system_font(FONT_KEY_GOTHIC_24),
    GRect(6, 36, bounds.size.w - 12, 26),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);

  // Thin separator line at bottom
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

// --- AppMessage: receive data from phone ---

static void inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *total_t = dict_find(iter, KEY_TOTAL);
  if (total_t) {
    s_reading_count = 0;
    layer_set_hidden(text_layer_get_layer(s_status_layer), false);
    text_layer_set_text(s_status_layer, "Receiving...");
  }

  Tuple *idx_t  = dict_find(iter, KEY_INDEX);
  Tuple *sys_t  = dict_find(iter, KEY_SYSTOLIC);
  Tuple *dia_t  = dict_find(iter, KEY_DIASTOLIC);
  Tuple *date_t = dict_find(iter, KEY_DATE);

  if (idx_t && sys_t && dia_t && date_t) {
    int i = (int)idx_t->value->int32;
    if (i >= 0 && i < MAX_READINGS) {
      s_readings[i].systolic  = (int)sys_t->value->int32;
      s_readings[i].diastolic = (int)dia_t->value->int32;
      strncpy(s_readings[i].date, date_t->value->cstring,
              sizeof(s_readings[i].date) - 1);
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

  s_status_layer = text_layer_create(
    GRect(0, b.size.h / 2 - 20, b.size.w, 40));
  text_layer_set_text(s_status_layer, "Opening settings\nto load data");
  text_layer_set_text_alignment(s_status_layer, GTextAlignmentCenter);
  text_layer_set_font(s_status_layer,
    fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  layer_add_child(root, text_layer_get_layer(s_status_layer));

  s_menu_layer = menu_layer_create(b);

  // Black background + white text for the selected row
  menu_layer_set_highlight_colors(s_menu_layer, GColorBlack, GColorWhite);

  menu_layer_set_callbacks(s_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_sections  = menu_num_sections,
    .get_num_rows      = menu_num_rows,
    .get_header_height = menu_header_height,
    .draw_header       = menu_draw_header,
    .draw_row          = menu_draw_row,
    .get_cell_height   = menu_cell_height,
  });
  menu_layer_set_click_config_onto_window(s_menu_layer, window);
  layer_add_child(root, menu_layer_get_layer(s_menu_layer));
}

static void window_unload(Window *window) {
  menu_layer_destroy(s_menu_layer);
  text_layer_destroy(s_status_layer);
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
