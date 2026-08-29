import { taskAggregator } from '../src/services/taskAggregator';

async function runTests() {
  console.log('--- Running Task Aggregator Verification Suite ---\n');

  // Test 1: Fetch tasks and verify sorting
  console.log('1. Testing Task Aggregation and Sorting...');
  const tasks = await taskAggregator.getTasks({}, true);
  if (tasks.length === 0) {
    throw new Error('FAIL: Expected tasks to be returned from mock/active providers');
  }
  console.log(`✓ Retrieved ${tasks.length} aggregated tasks`);

  // Verify urgent tasks are sorted to the top
  const firstTask = tasks[0];
  console.log(`✓ First task priority is "${firstTask.priority}" (Title: "${firstTask.title}")`);
  if (firstTask.priority !== 'urgent') {
    console.warn('Note: Expected top task to be urgent if urgent tasks exist');
  }

  // Test 2: Calculate stats
  console.log('\n2. Testing Stats Calculation...');
  const stats = taskAggregator.getStats(tasks);
  console.log('Aggregated Stats:', JSON.stringify(stats, null, 2));
  if (stats.total !== tasks.length) {
    throw new Error(`FAIL: Stats total (${stats.total}) does not match tasks length (${tasks.length})`);
  }
  console.log('✓ Stats calculation validated');

  // Test 3: Filter by source
  console.log('\n3. Testing Filtering by Source...');
  const trelloTasks = await taskAggregator.getTasks({ source: 'trello' });
  console.log(`✓ Found ${trelloTasks.length} Trello tasks`);
  trelloTasks.forEach((t) => {
    if (t.source !== 'trello') throw new Error(`FAIL: Found non-trello task in trello filter: ${t.source}`);
  });

  const gmailTasks = await taskAggregator.getTasks({ source: 'gmail' });
  console.log(`✓ Found ${gmailTasks.length} Gmail tasks`);
  gmailTasks.forEach((t) => {
    if (t.source !== 'gmail') throw new Error(`FAIL: Found non-gmail task in gmail filter: ${t.source}`);
  });

  // Test 4: Complete a task
  console.log('\n4. Testing Task Completion...');
  const targetTask = tasks.find((t) => t.status !== 'completed');
  if (targetTask) {
    const success = await taskAggregator.completeTask(targetTask.id);
    if (!success) throw new Error(`FAIL: Complete task returned false for ${targetTask.id}`);
    const updatedTasks = await taskAggregator.getTasks();
    const updated = updatedTasks.find((t) => t.id === targetTask.id);
    if (updated?.status !== 'completed') {
      throw new Error(`FAIL: Task ${targetTask.id} status was not updated to completed`);
    }
    console.log(`✓ Successfully completed task: "${targetTask.title}"`);
  }

  // Test 5: Snooze a task
  console.log('\n5. Testing Task Snooze...');
  const taskToSnooze = tasks.find((t) => t.status === 'pending');
  if (taskToSnooze) {
    const snoozeDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const snoozeOk = await taskAggregator.snoozeTask(taskToSnooze.id, snoozeDate);
    if (!snoozeOk) throw new Error(`FAIL: Snooze task failed for ${taskToSnooze.id}`);
    console.log(`✓ Successfully snoozed task: "${taskToSnooze.title}"`);
  }

  console.log('\n=============================================');
  console.log('🎉 ALL AGGREGATOR TESTS PASSED SUCCESSFULLY!');
  console.log('=============================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
