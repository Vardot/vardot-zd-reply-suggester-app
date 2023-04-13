const client = ZAFClient.init();
const TEMPLATE_INITIAL_PROMPT = `The following is a customer support ticket. Knowing that the agent who is going to be responding is from Vardot, provide the below information, and return response under the main headers below with headers as h5 HTML tags, lists as HTML lists.
- Suggested questions to ask to clarify the request.
- Suggest brief response.
- Suggested actions the agent should take.

Keep it less formal, natural, not very apologetic, and customer-service oriented.`;

const container = document.getElementById("container");
const excludeAgentCheckbox = document.getElementById("exclude-agent");
const convoContainer = document.getElementById('convo-container');
const checkBoxesWrapper = document.getElementById('checkboxes-wrapper');


// Main function to update the summary from OpenAI
async function updateSummary(convo, showCheckboxes = false) {
  container.style.display = "block";
  container.textContent = "Analyzing...";

  const button = document.querySelector("#ticket_summarizer-get-summary");
  const label = document.querySelector(".exclude-agent-label");

  const prompt = await getPrompt(JSON.stringify(convo));

  try {
    setUIState({ button, label }, "disabled");

    const summary = await getSummary(prompt);

    client.invoke("resize", { width: "100%", height: "400px" });
    setUIState({ button, label }, "enabled");

    if (showCheckboxes) {
      checkBoxesWrapper.style.display = "block";
    }
    else {
     checkBoxesWrapper.style.display = "none"; 
    }
    container.innerHTML = summary;
  } catch (error) {
    container.textContent = `An error occured: ${error.responseJSON.error.message}`;

    const convo = await getTicketConvo(true, excludeAgentCheckbox.checked);
    checkBoxesWrapper.style.display = "block";
    convoContainer.innerHTML = renderConvoCheckboxes(convo);

    setUIState({ button, label }, "enabled");
  }
}

function setUIState({ button, label }, state) {
  if (state === "disabled") {
    button.classList.add("is-disabled");
    label.classList.add("is-disabled");
  } else {
    button.classList.remove("is-disabled");
    label.classList.remove("is-disabled");
  }
}

// Gets the ticket conversation and filters conversation replies based on some rules
async function getTicketConvo(excludeInternal = true, excludeAgent) {
  try {
    const ticketConvo = await client.get("ticket.conversation");
    let filteredConvo = ticketConvo["ticket.conversation"];

    if (excludeInternal) {
      filteredConvo = filteredConvo.filter(conversation => conversation.channel.name !== "internal");
    }

    if (excludeAgent) {
      filteredConvo = filteredConvo.filter(conversation => conversation.author.role === "end-user");
    }

    return cleanTicketConvoData(filteredConvo);
  } catch (error) {
    console.error(`An error occurred: ${JSON.stringify(error)}`);
    throw error;
  }
}

async function getPrompt(convo) {
  return `${TEMPLATE_INITIAL_PROMPT}\n\n${convo}`;
}

function cleanTicketConvoData(rawData) {
  return rawData.map(({ author, channel, message, ...remainingConversation }) => {
    const { id, avatar, ...remainingAuthor } = author;
    const { contentType, ...remainingMessage } = message;

    return {
      ...remainingConversation,
      author: remainingAuthor,
      message: remainingMessage
    };
  });
}

async function getSummary(prompt) {
  try {
    const options = {
      url: "https://api.openai.com/v1/chat/completions",
      type: "POST",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer {{setting.openAiApiToken}}",
      },
      data: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
      secure: true,
    };
    const response = await client.request(options);

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(JSON.stringify(error));
    throw error;
  }
}

// Helper function to remove the HTML from conversations
function stripHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// Helper function to truncate convestation in checkboxes
function truncate(str, n) {
  return (str.length > n) ? str.substr(0, n - 1) + '…' : str;
}

// Render checkboxes functions
function renderConvoCheckboxes(convo) {
  let html = '';

  convo.forEach((item, index) => {
    const count = index + 1;
    const authorName = item.author.name;
    const timestamp = item.timestamp;
    const dateObj = new Date(timestamp);
    const date = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    const messageContent = stripHTML(item.message.content);
    const truncatedContent = truncate(messageContent, 30);

    html += `
      <div class="c-chk u-mb-xs">
        <input class="c-chk__input" id="chk-${count}" name="chk-${count}" type="checkbox" />
        <label class="c-chk__label c-chk__label--regular c-chk__label--regular" for="chk-${count}">
          #${count} ${authorName} on ${date} – ${truncatedContent}
        </label>
      </div>`;
  });

  return html;
}


// Event listener for the button click
document.getElementById("ticket_summarizer-get-summary").addEventListener("click", async () => {
  const convo = await getTicketConvo(true, excludeAgentCheckbox.checked);

  // Check if any of the convo checkboxes are checked
  const checkboxes = document.getElementsByClassName("c-chk__input");
  let isChecked = false;
  for (let checkbox of checkboxes) {
    if (checkbox.checked) {
      isChecked = true;
      break;
    }
  }

  // If any checkbox is checked and checkbox wrapper is visible
  if (isChecked && checkBoxesWrapper.style.display === "block") {
    // Filter out the items that correspond to unchecked checkboxes
    const cherryPickedConvo = convo.filter((item, index) => {
      const checkbox = document.getElementById(`chk-${index + 1}`);
      return checkbox.checked;
    });

    // Send the filtered object to the updateSummary function
    await updateSummary(cherryPickedConvo, true);
  } else {
    // If no checkboxes are checked or checkBoxesWrapper.style.display is not "block", send the original convo object
    await updateSummary(convo);
  }
});

// Event listener for the checkbox state change
document.getElementById("exclude-agent").addEventListener("change", async () => {
  // Build list to cherry-pick conversations
  const convo = await getTicketConvo(true, excludeAgentCheckbox.checked);
  convoContainer.innerHTML = renderConvoCheckboxes(convo);
});


client.on("app.registered", async () => {
  client.invoke("resize", { width: "100%", height: "400px" });
  const convo = await getTicketConvo(true, excludeAgentCheckbox.checked);
  await updateSummary(convo);
});

client.on("ticket.conversation.changed", async () => {
  container.innerHTML = "Conversation changed. Click to regenerate the summary with the new changes.";
});
