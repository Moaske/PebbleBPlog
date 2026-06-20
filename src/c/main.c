#include <pebble.h>

// Message keys — must match pebble-js-app.js
#define KEY_INDEX     0
#define KEY_SYSTOLIC  1
#define KEY_DIASTOLIC 2
#define KEY_DATE      3
#define KEY_TOTAL     4

#define MAX_READINGS 10

// One blood pressure reading
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

// --- Menu callbacks ---

static uint16_t menu_num_rows(MenuLayer *ml, uint16_t section, void *ctx) {
  return s_reading_count > 0 ? s_reading_count : 1;
}

static void menu_draw_row(GContext *ctx, const Layer *cell,
                          MenuIndex *idx, void *context) {
  if (s_reading_count == 0) {
    menu_cell_basic_draw(ctx, cell, "Waiting for data", "Open settings first", NULL);
    return;
  }
  BPReading *r = &s_readings[idx->row];
  char sub[24];
  snprintf(sub, sizeof(sub), "%d / %d mmHg", r->systolic, r->diastolic);
  menu_cell_basic_draw(ctx, cell, r->date, sub, NULL);
}

static int16_t menu_cell_height(MenuLayer *ml, MenuIndex *idx, void *ctx) {
  return 44;
}

// --- AppMessage: receive data from phone ---

static void inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *total_t = dict_find(iter, KEY_TOTAL);
  if (total_t) {
    // New batch starting — reset
    s_reading_count = 0;
    layer_set_hidden(text_layer_get_layer(s_status_layer), false);
    text_layer_set_text(s_status_layer, "Receiving...");
  }

  Tuple *idx_t = dict_find(iter, KEY_INDEX);
  Tuple *sys_t = dict_find(iter, KEY_SYSTOLIC);
  Tuple *dia_t = dict_find(iter, KEY_DIASTOLIC);
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

  // Status text shown while loading
  s_status_layer = text_layer_create(
    GRect(0, b.size.h / 2 - 20, b.size.w, 40));
  text_layer_set_text(s_status_layer, "Opening settings\nto load data");
  text_layer_set_text_alignment(s_status_layer, GTextAlignmentCenter);
  text_layer_set_font(s_status_layer,
    fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  layer_add_child(root, text_layer_get_layer(s_status_layer));

  // Scrollable menu
  s_menu_layer = menu_layer_create(b);
  menu_layer_set_callbacks(s_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows   = menu_num_rows,
    .draw_row       = menu_draw_row,
    .get_cell_height= menu_cell_height,
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