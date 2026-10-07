// app.js

const flashcards = [
    {
        front: 'O que é o Vercel?',
        back: 'Uma plataforma de nuvem para sites estáticos e funções Serverless, excelente para hospedar projetos frontend.'
    },
    {
        front: 'O que é HTML?',
        back: 'Linguagem de Marcação de Hipertexto, usada para estruturar páginas web.'
    },
    {
        front: 'O que é CSS?',
        back: 'Cascading Style Sheets, usado para estilizar a apresentação visual das páginas.'
    },
    {
        front: 'O que é JavaScript?',
        back: 'Uma linguagem de programação que permite implementar funcionalidades complexas em páginas web.'
    }
];

let currentIndex = 0;
let isFlipped = false;

// DOM Elements
const flashcard = document.getElementById('flashcard');
const flashcardInner = document.getElementById('flashcard-inner');
const cardFrontText = document.getElementById('card-front-text');
const cardBackText = document.getElementById('card-back-text');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const cardCounter = document.getElementById('card-counter');

function updateCard() {
    // Reset flip state when changing cards
    if (isFlipped) {
        flashcardInner.classList.remove('flipped');
        isFlipped = false;
        
        // Wait for flip animation to finish before updating text
        setTimeout(() => {
            renderCardData();
        }, 300);
    } else {
        renderCardData();
    }
}

function renderCardData() {
    const card = flashcards[currentIndex];
    cardFrontText.textContent = card.front;
    cardBackText.textContent = card.back;
    
    cardCounter.textContent = `${currentIndex + 1} / ${flashcards.length}`;
    
    btnPrev.disabled = currentIndex === 0;
    btnNext.disabled = currentIndex === flashcards.length - 1;
}

function toggleFlip() {
    isFlipped = !isFlipped;
    flashcardInner.classList.toggle('flipped');
}

// Event Listeners
flashcard.addEventListener('click', toggleFlip);

btnNext.addEventListener('click', () => {
    if (currentIndex < flashcards.length - 1) {
        currentIndex++;
        updateCard();
    }
});

btnPrev.addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        updateCard();
    }
});

// Initialize first card
updateCard();
