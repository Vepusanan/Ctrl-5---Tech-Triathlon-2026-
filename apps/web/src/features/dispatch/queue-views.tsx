// D02a · Saved views drawer (Figma 2106:10491)
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Button,
  Chip,
  Field,
  Icon,
  IconButton,
  Overlay,
  Popover,
  SegmentedControl,
  Switch,
} from '../../components/waypoint';
import {
  type QueueFilters,
  type QueueOrder,
  type SavedView,
  savedViewListSchema,
  savedViewSchema,
} from './contracts';
import { api, message, noContent } from './data/client';
import {
  type FilterKey,
  filterChips,
  filterChoices,
  filterNames,
  hasFilters,
  matches,
  withFilter,
} from './queue-filters';

const audiences = [
  { value: 'private', label: 'Only me' },
  { value: 'team', label: 'Planning team' },
] as const;

const audienceLabel = { private: 'Only me', team: 'Planning team' };

export function SavedViewsDrawer({
  open,
  onClose,
  orders,
  views,
  initialFilters,
}: {
  open: boolean;
  onClose: () => void;
  orders: readonly QueueOrder[];
  views: readonly SavedView[];
  /** The filters applied on the queue when the drawer opened. */
  initialFilters: QueueFilters;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [filters, setFilters] = useState<QueueFilters>(initialFilters);
  const [audience, setAudience] = useState<SavedView['audience']>('team');
  const [pinned, setPinned] = useState(true);
  const [dragged, setDragged] = useState<string | null>(null);

  // Start a fresh form each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setName('');
    setNameError(undefined);
    setFilters(initialFilters);
    setAudience('team');
    setPinned(true);
  }, [open, initialFilters]);

  const refresh = () => client.invalidateQueries({ queryKey: ['planning', 'views'] });
  const save = useMutation({
    mutationFn: () =>
      api(editing ? `/planning/views/${editing}` : '/planning/views', savedViewSchema, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: name.trim(), audience, pinned, filters }),
      }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/planning/views/${id}`, noContent, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api('/planning/views/order', savedViewListSchema, {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (data) => client.setQueryData(['planning', 'views'], data),
  });

  const move = (id: string, to: number) => {
    const ids = views.map((view) => view.id).filter((item) => item !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    reorder.mutate(ids);
  };
  const edit = (view: SavedView) => {
    setEditing(view.id);
    setName(view.name);
    setNameError(undefined);
    setFilters(view.filters);
    setAudience(view.audience);
    setPinned(view.pinned);
  };
  const validateName = () => {
    const error = name.trim() ? undefined : 'Give the view a name so it can be found later.';
    setNameError(error);
    return !error;
  };

  const choices = filterChoices(orders);
  const unused = (Object.keys(choices) as FilterKey[]).filter((key) => !filters[key]);
  const matching = orders.filter((order) => matches(order, filters)).length;
  const failure = save.error ?? remove.error ?? reorder.error;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={editing ? 'Edit this view' : 'Save this view'}
      icon="eye"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            busy={save.isPending}
            disabled={!hasFilters(filters)}
            onClick={() => validateName() && save.mutate()}
          >
            {editing ? 'Update view' : 'Save view'}
          </Button>
        </>
      }
    >
      <Field
        label="Name"
        value={name}
        placeholder="Chilled unallocated · Kandy"
        error={nameError}
        onChange={(event) => setName(event.target.value)}
        onBlur={validateName}
      />
      <div className="dq-drawer-group">
        <p>Filters in this view</p>
        <div className="dq-chips">
          {filterChips(filters).map((chip) => (
            <Chip
              key={chip.key}
              icon="filter"
              onRemove={() => setFilters(withFilter(filters, chip.key, ''))}
            >
              {chip.label}
            </Chip>
          ))}
          {unused.length > 0 && (
            <label className="wp-chip dq-add-filter" data-dashed>
              <Icon name="plus" size={14} />
              <span className="wp-sr-only">Add filter</span>
              <select
                value=""
                onChange={(event) => {
                  const [key, value] = event.target.value.split(':');
                  if (key && value) setFilters(withFilter(filters, key as FilterKey, value));
                }}
              >
                <option value="">Add filter</option>
                {unused.map((key) => (
                  <optgroup key={key} label={filterNames[key]}>
                    {choices[key].map((choice) => (
                      <option key={choice.value} value={`${key}:${choice.value}`}>
                        {choice.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
        </div>
        {!hasFilters(filters) && (
          <p role="alert" className="dq-drawer-error">
            Add at least one filter. A view with no filters is the whole queue.
          </p>
        )}
      </div>
      <div className="dq-drawer-group">
        <p>Who sees it</p>
        <SegmentedControl
          label="Who sees it"
          value={audience}
          options={audiences}
          onChange={setAudience}
        />
      </div>
      <div className="dq-drawer-row dq-drawer-row--sunken">
        <Icon name="pin" />
        <strong>Pin to the queue toolbar</strong>
        <Switch label="Pin to the queue toolbar" checked={pinned} onChange={setPinned} />
      </div>
      <div className="dq-drawer-row">
        <Icon name="list" />
        <span>Matches now</span>
        <strong role="status">
          {matching} {matching === 1 ? 'order' : 'orders'}
        </strong>
      </div>
      {failure && (
        <p role="alert" className="dq-drawer-error">
          {message(failure)}
        </p>
      )}
      <hr className="dq-divider" />
      <h3 className="dq-drawer-heading">Your views</h3>
      {views.length === 0 && <p className="wp-muted">No saved views yet.</p>}
      <ol className="wp-list dq-views">
        {views.map((view, index) => (
          <li
            key={view.id}
            data-dragging={dragged === view.id || undefined}
            onDragOver={(event) => dragged && event.preventDefault()}
            onDrop={() => {
              if (dragged && dragged !== view.id) move(dragged, index);
              setDragged(null);
            }}
          >
            <button
              type="button"
              className="wp-icon-bare dq-grip"
              draggable
              aria-label={`Reorder ${view.name}. Use the up and down arrow keys.`}
              onDragStart={() => setDragged(view.id)}
              onDragEnd={() => setDragged(null)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') move(view.id, index - 1);
                if (event.key === 'ArrowDown') move(view.id, index + 1);
              }}
            >
              <Icon name="grip" />
            </button>
            <div>
              <strong>{view.name}</strong>
              <span>{audienceLabel[view.audience]}</span>
            </div>
            <small>{orders.filter((order) => matches(order, view.filters)).length}</small>
            <IconButton bare icon="pen" label={`Edit ${view.name}`} onClick={() => edit(view)} />
            <Popover bare icon="more" label={`More for ${view.name}`}>
              <Button
                variant="destructive"
                size="md"
                busy={remove.isPending && remove.variables === view.id}
                onClick={() => remove.mutate(view.id)}
              >
                Delete view
              </Button>
            </Popover>
          </li>
        ))}
      </ol>
    </Overlay>
  );
}
